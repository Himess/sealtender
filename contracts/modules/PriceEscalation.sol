// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EscalationRule} from "../interfaces/ISealTender.sol";
import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";
import {IPyth} from "../interfaces/IPyth.sol";

/**
 * @title PriceEscalation
 * @notice Handles material price escalation with Chainlink oracle integration
 *         and automatic payment to tender winners.
 */
contract PriceEscalation is Ownable2Step {
    // --- Constants ---
    uint256 public constant MAX_PRICE_CHANGE_BPS = 5000; // 50%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // --- State ---
    mapping(uint256 => mapping(bytes32 => EscalationRule)) public rules;
    mapping(uint256 => uint256) public totalEscalationPaid;
    mapping(uint256 => uint256) public tenderPrice;
    mapping(bytes32 => uint256) public latestPrices;

    /// @notice Single contract permitted to call setTenderWinner from a tender
    ///         contract's `revealWinner` flow (typically the TenderFactory or
    ///         its delegate). Owner-set; pass `address(0)` to revoke.
    /// @dev    Without this, EncryptedTender.winnerSink would call
    ///         setTenderWinner and revert under `onlyOwner`, silently failing
    ///         the auto-forward (M-5). With it, the tenderManager allow-lists
    ///         winner writes from any tender it created.
    address public tenderManager;
    /// @dev tender_address → true once authorized to forward winner writes
    mapping(address => bool) public authorizedTenders;

    // Chainlink price feed mapping: materialId -> feed address
    mapping(bytes32 => address) public priceFeeds;

    // Escalation budget deposited by municipality
    mapping(uint256 => uint256) public escalationBudget;
    // Winner address per tender (set by admin after reveal)
    mapping(uint256 => address) public tenderWinner;

    // Pyth oracle integration
    IPyth public pyth;
    mapping(bytes32 => bytes32) public pythFeedIds; // materialId => Pyth feed ID
    uint256 public constant PYTH_MAX_AGE = 1 hours;

    // --- Events ---
    event EscalationRuleSet(uint256 indexed tenderId, bytes32 materialId);
    event EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment);
    event OraclePriceUpdated(bytes32 indexed materialId, uint256 newPrice);
    event PriceFeedSet(bytes32 indexed materialId, address feed);
    event EscalationBudgetDeposited(uint256 indexed tenderId, uint256 amount);
    event EscalationPayment(uint256 indexed tenderId, address indexed winner, uint256 amount);
    event PythSet(address indexed pyth);
    event PythFeedSet(bytes32 indexed materialId, bytes32 feedId);
    event TenderManagerSet(address indexed manager);
    event TenderAuthorized(address indexed tender);

    // --- Errors ---
    error EscalationCapExceeded();
    error PeriodNotElapsed();
    error NoRuleSet();
    error PriceChangeExceedsLimit();
    error InsufficientEscalationBudget(uint256 tenderId, uint256 required, uint256 available);
    error NoWinnerSet(uint256 tenderId);
    error PaymentFailed();
    error PriceZero();

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    function setTenderPrice(uint256 tenderId, uint256 price) external onlyOwner {
        tenderPrice[tenderId] = price;
    }

    function setPriceFeed(bytes32 materialId, address feed) external onlyOwner {
        priceFeeds[materialId] = feed;
        emit PriceFeedSet(materialId, feed);
    }

    function setPyth(address _pyth) external onlyOwner {
        pyth = IPyth(_pyth);
        emit PythSet(_pyth);
    }

    function setPythFeed(bytes32 materialId, bytes32 feedId) external onlyOwner {
        pythFeedIds[materialId] = feedId;
        emit PythFeedSet(materialId, feedId);
    }

    /// @notice Record the revealed winner for a tender. Callable by:
    ///         1. The contract owner (manual admin path), or
    ///         2. The configured tenderManager (typically the TenderFactory), or
    ///         3. An authorized tender contract whose creation was tracked by
    ///            the tenderManager — this is the auto-forward path triggered
    ///            from `EncryptedTender.revealWinner` via `winnerSink`.
    /// @dev    Closes the M-5 silent-fail bug where the prior `onlyOwner` gate
    ///         caused `winnerSink.call(setTenderWinner)` to revert without
    ///         updating state.
    function setTenderWinner(uint256 tenderId, address winner) external {
        if (
            msg.sender != owner() &&
            msg.sender != tenderManager &&
            !authorizedTenders[msg.sender]
        ) revert("PriceEscalation: not authorized");
        tenderWinner[tenderId] = winner;
    }

    /// @notice Owner-only: pin a single contract (typically the TenderFactory)
    ///         as the gatekeeper for adding new authorized tender writers.
    function setTenderManager(address _tm) external onlyOwner {
        tenderManager = _tm;
        emit TenderManagerSet(_tm);
    }

    /// @notice Allow a freshly created tender contract to write its own winner.
    ///         Callable by owner or tenderManager (factory).
    function authorizeTender(address tender) external {
        if (msg.sender != owner() && msg.sender != tenderManager) {
            revert("PriceEscalation: not authorized");
        }
        require(tender != address(0), "zero tender");
        authorizedTenders[tender] = true;
        emit TenderAuthorized(tender);
    }

    function setEscalationRule(
        uint256 tenderId,
        bytes32 materialId,
        uint256 baselinePrice,
        uint256 thresholdPercent,
        uint256 capPercent,
        uint256 periodSeconds
    ) external onlyOwner {
        rules[tenderId][materialId] = EscalationRule({
            materialId: materialId,
            baselinePrice: baselinePrice,
            thresholdPercent: thresholdPercent,
            capPercent: capPercent,
            periodSeconds: periodSeconds,
            lastEvaluated: block.timestamp
        });
        emit EscalationRuleSet(tenderId, materialId);
    }

    /**
     * @notice Manual oracle price update (fallback for materials without Chainlink feeds).
     */
    function updateOraclePrice(bytes32 materialId, uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert PriceZero();
        uint256 oldPrice = latestPrices[materialId];
        if (oldPrice > 0) {
            // Oracle sanity check: price change must not exceed 50%
            uint256 diff = newPrice > oldPrice ? newPrice - oldPrice : oldPrice - newPrice;
            uint256 maxChange = (oldPrice * MAX_PRICE_CHANGE_BPS) / BPS_DENOMINATOR;
            if (diff > maxChange) revert PriceChangeExceedsLimit();
        }
        latestPrices[materialId] = newPrice;
        emit OraclePriceUpdated(materialId, newPrice);
    }

    // --- Budget ---

    function depositEscalationBudget(uint256 tenderId) external payable {
        escalationBudget[tenderId] += msg.value;
        emit EscalationBudgetDeposited(tenderId, msg.value);
    }

    // --- Core ---

    function evaluateEscalation(
        uint256 tenderId,
        bytes32 materialId
    ) external onlyOwner returns (uint256 extraPayment) {
        EscalationRule storage rule = rules[tenderId][materialId];
        if (rule.baselinePrice == 0) revert NoRuleSet();
        if (block.timestamp < rule.lastEvaluated + rule.periodSeconds) {
            revert PeriodNotElapsed();
        }

        uint256 currentPrice = getLatestPrice(materialId);
        if (currentPrice <= rule.baselinePrice) return 0;

        uint256 increase = currentPrice - rule.baselinePrice;
        uint256 increaseBps = (increase * BPS_DENOMINATOR) / rule.baselinePrice;

        if (increaseBps < rule.thresholdPercent) return 0;
        if (increaseBps > rule.capPercent) revert EscalationCapExceeded();

        extraPayment = (tenderPrice[tenderId] * increaseBps) / BPS_DENOMINATOR;
        rule.lastEvaluated = block.timestamp;

        emit EscalationTriggered(tenderId, materialId, extraPayment);

        // Auto-pay winner if budget available. `totalEscalationPaid` only updates
        // after the actual payment lands so the counter never leads the balance.
        address winner = tenderWinner[tenderId];
        if (winner != address(0) && extraPayment > 0) {
            if (escalationBudget[tenderId] < extraPayment) {
                revert InsufficientEscalationBudget(tenderId, extraPayment, escalationBudget[tenderId]);
            }
            escalationBudget[tenderId] -= extraPayment;
            totalEscalationPaid[tenderId] += extraPayment;
            (bool ok,) = payable(winner).call{value: extraPayment}("");
            if (!ok) revert PaymentFailed();
            emit EscalationPayment(tenderId, winner, extraPayment);
        }

        return extraPayment;
    }

    // --- Views ---

    /// @notice Target precision for normalized prices (1e8 — matches typical
    ///         Chainlink USD-pair feeds so on-chain math is unit-consistent).
    uint256 public constant ORACLE_PRECISION = 1e8;

    /**
     * @notice Fetch price for `materialId`, normalized to ORACLE_PRECISION (1e8).
     * @dev Priority: Chainlink → Pyth → manual fallback.
     *
     *      Chainlink:
     *        - Validates `answeredInRound >= roundId` (catches stalled rounds the
     *          legacy `updatedAt` check would silently pass)
     *        - Validates `updatedAt > 0` and `< 1 day` heartbeat
     *        - Normalizes from feed.decimals() to ORACLE_PRECISION
     *
     *      Pyth:
     *        - Uses `getPriceNoOlderThan(maxAge)` for staleness
     *        - Applies the (signed) `expo` field properly: if expo == -8, price is
     *          already at 1e8 scale; otherwise rescale to ORACLE_PRECISION
     *
     *      Manual: returned as-is (admin's responsibility to set in 1e8 scale).
     */
    function getLatestPrice(bytes32 materialId) public view returns (uint256) {
        // Priority 1: Chainlink feed
        address feed = priceFeeds[materialId];
        if (feed != address(0)) {
            (uint80 roundId, int256 price, , uint256 updatedAt, uint80 answeredInRound) =
                IAggregatorV3(feed).latestRoundData();
            require(price > 0, "Invalid Chainlink price");
            require(updatedAt > 0, "Round not complete");
            require(answeredInRound >= roundId, "Stale Chainlink round");
            require(block.timestamp - updatedAt < 1 days, "Stale Chainlink data");
            uint8 feedDecimals = IAggregatorV3(feed).decimals();
            return _scaleTo1e8(uint256(price), feedDecimals);
        }
        // Priority 2: Pyth feed
        bytes32 pythFeedId = pythFeedIds[materialId];
        if (pythFeedId != bytes32(0) && address(pyth) != address(0)) {
            IPyth.Price memory p = pyth.getPriceNoOlderThan(pythFeedId, PYTH_MAX_AGE);
            require(p.price > 0, "Invalid Pyth price");
            // Pyth: actualPrice = p.price * 10^p.expo. Normalize to 1e8 scale.
            // Most majors publish expo = -8 → already at 1e8.
            uint256 raw = uint256(uint64(p.price));
            if (p.expo == -8) {
                return raw;
            } else if (p.expo < -8) {
                // expo more negative → divide by 10^(-expo - 8)
                uint256 div = 10 ** uint256(int256(-int256(p.expo)) - 8);
                return raw / div;
            } else if (p.expo < 0) {
                // expo between -7 and -1 → multiply by 10^(8 + expo)
                uint256 mult = 10 ** uint256(int256(8) + int256(p.expo));
                return raw * mult;
            } else {
                // expo >= 0 → multiply by 10^(8 + expo)
                uint256 mult = 10 ** (8 + uint256(int256(p.expo)));
                return raw * mult;
            }
        }
        // Priority 3: Manual fallback (admin sets in 1e8 scale)
        return latestPrices[materialId];
    }

    /// @dev Linear rescale of `value` from `srcDecimals` to ORACLE_PRECISION (1e8).
    function _scaleTo1e8(uint256 value, uint8 srcDecimals) internal pure returns (uint256) {
        if (srcDecimals == 8) return value;
        if (srcDecimals < 8) {
            return value * (10 ** (8 - srcDecimals));
        }
        return value / (10 ** (srcDecimals - 8));
    }

    function getBaselinePrice(
        uint256 tenderId,
        bytes32 materialId
    ) external view returns (uint256) {
        return rules[tenderId][materialId].baselinePrice;
    }

    function getTotalEscalation(uint256 tenderId) external view returns (uint256) {
        return totalEscalationPaid[tenderId];
    }
}
