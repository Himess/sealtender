// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EscalationRule} from "../interfaces/ISealTender.sol";
import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

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

    // Chainlink price feed mapping: materialId -> feed address
    mapping(bytes32 => address) public priceFeeds;

    // Escalation budget deposited by municipality
    mapping(uint256 => uint256) public escalationBudget;
    // Winner address per tender (set by admin after reveal)
    mapping(uint256 => address) public tenderWinner;

    // --- Events ---
    event EscalationRuleSet(uint256 indexed tenderId, bytes32 materialId);
    event EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment);
    event OraclePriceUpdated(bytes32 indexed materialId, uint256 newPrice);
    event PriceFeedSet(bytes32 indexed materialId, address feed);
    event EscalationBudgetDeposited(uint256 indexed tenderId, uint256 amount);
    event EscalationPayment(uint256 indexed tenderId, address indexed winner, uint256 amount);

    // --- Errors ---
    error EscalationCapExceeded();
    error PeriodNotElapsed();
    error NoRuleSet();
    error PriceChangeExceedsLimit();
    error InsufficientEscalationBudget(uint256 tenderId, uint256 required, uint256 available);
    error NoWinnerSet(uint256 tenderId);
    error PaymentFailed();

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    function setTenderPrice(uint256 tenderId, uint256 price) external onlyOwner {
        tenderPrice[tenderId] = price;
    }

    function setPriceFeed(bytes32 materialId, address feed) external onlyOwner {
        priceFeeds[materialId] = feed;
        emit PriceFeedSet(materialId, feed);
    }

    function setTenderWinner(uint256 tenderId, address winner) external onlyOwner {
        tenderWinner[tenderId] = winner;
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
        totalEscalationPaid[tenderId] += extraPayment;
        rule.lastEvaluated = block.timestamp;

        emit EscalationTriggered(tenderId, materialId, extraPayment);

        // Auto-pay winner if budget available
        address winner = tenderWinner[tenderId];
        if (winner != address(0) && extraPayment > 0) {
            if (escalationBudget[tenderId] < extraPayment) {
                revert InsufficientEscalationBudget(tenderId, extraPayment, escalationBudget[tenderId]);
            }
            escalationBudget[tenderId] -= extraPayment;
            (bool ok,) = payable(winner).call{value: extraPayment}("");
            if (!ok) revert PaymentFailed();
            emit EscalationPayment(tenderId, winner, extraPayment);
        }

        return extraPayment;
    }

    // --- Views ---

    /**
     * @notice Fetch price from Chainlink if feed exists, fallback to manual latestPrices.
     */
    function getLatestPrice(bytes32 materialId) public view returns (uint256) {
        address feed = priceFeeds[materialId];
        if (feed != address(0)) {
            (, int256 price,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();
            require(price > 0, "Invalid oracle price");
            require(block.timestamp - updatedAt < 1 days, "Stale oracle data");
            return uint256(price);
        }
        return latestPrices[materialId]; // fallback to manual
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
