// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, euint32, ebool, externalEuint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TenderConfig, TenderState, TenderSpecification} from "../interfaces/ISealTender.sol";
import {BidderRegistry} from "../identity/BidderRegistry.sol";
import {BidEscrow} from "./BidEscrow.sol";

/**
 * @title EncryptedTender
 * @notice FHE-encrypted sealed-bid tender with on-chain evaluation.
 */
contract EncryptedTender is ZamaEthereumConfig, Ownable2Step, Pausable, ReentrancyGuard {
    // --- Structs ---
    struct BidData {
        euint64 encPrice;
        euint32 encYears;
        euint32 encProjects;
        euint64 encBond;
        uint256 timestamp;
        uint256 version;
    }

    // --- State ---
    uint256 public tenderId;
    TenderConfig public config;
    TenderSpecification public spec;
    TenderState public state;
    BidderRegistry public registry;
    BidEscrow public escrow;

    /// @notice Optional sink for the revealed winner (e.g. PriceEscalation). If set,
    ///         {revealWinner} forwards the winner via low-level call so escalation
    ///         payouts are wired automatically without a separate admin step.
    address public winnerSink;
    bytes4 public constant WINNER_SINK_SELECTOR = bytes4(keccak256("setTenderWinner(uint256,address)"));

    /// @notice After {requestReveal}, if the owner fails to deliver the KMS-signed
    ///         decryption proof within `revealTimeout`, *anyone* may call
    ///         {forceCancelStuckReveal} to cancel the tender and unlock escrows.
    ///         Removes the single-point-of-liveness on the tender owner.
    uint256 public revealRequestedAt;
    uint256 public revealTimeout = 7 days;

    address[] public bidders;
    mapping(address => BidData) internal bids;
    mapping(address => bool) public hasBid;

    euint64 internal currentMinPrice;
    euint32 internal currentWinnerIdx;
    uint256 public evaluatedCount;
    bool public evaluationComplete;

    address public winnerAddress;
    uint256 public revealedPrice;
    bool public revealed;

    bytes32 public winnerIdxHandle;
    bytes32 public winnerPriceHandle;

    // --- Events ---
    event BidSubmitted(address indexed bidder, uint256 timestamp);
    event BidUpdated(address indexed bidder, uint256 version);
    event EvaluationBatchCompleted(uint256 startIdx, uint256 endIdx);
    event EvaluationCompleted(uint256 totalBidders);
    event RevealRequested(bytes32 idxHandle, bytes32 priceHandle);
    event WinnerRevealed(address winner, uint256 price);
    event TenderCancelled(uint256 timestamp);
    event WinnerSinkSet(address indexed sink);
    event WinnerSinkForwardFailed(address indexed sink, bytes returnData);
    event RevealTimeoutSet(uint256 secondsValue);
    event StuckRevealForceCancelled(address indexed by, uint256 elapsed);

    // --- Errors ---
    error NotVerifiedBidder();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InvalidState();
    error MaxBiddersReached();
    error EvaluationNotComplete();
    error AlreadyRevealed();
    error InsufficientReputation();
    error EscrowRequired();
    error NotEvaluating();
    error InvalidRange();
    error EndExceedsBidders();
    error MustEvaluateInOrder();
    error BatchTooLarge(uint256 size, uint256 max);
    error RevealNotRequested();
    error RevealTimeoutNotElapsed();
    error InvalidTimeout();

    /// @notice Hard cap on bidders per tender. Above this gas costs per evaluation
    ///         batch exceed practical block limits even with optimal batching.
    uint256 public constant MAX_BIDDERS = 50;
    /// @notice Maximum bidders processed per evaluateBatch call. Tuned for ~30M gas
    ///         per batch including FHE.lt + FHE.select + FHE.allowThis.
    uint256 public constant MAX_BATCH_SIZE = 10;

    // --- Modifiers ---
    modifier onlyVerified() {
        if (!registry.isVerified(msg.sender)) revert NotVerifiedBidder();
        _;
    }

    modifier beforeDeadline() {
        if (block.timestamp >= config.deadline) revert DeadlinePassed();
        _;
    }

    modifier afterDeadline() {
        if (block.timestamp < config.deadline) revert DeadlineNotPassed();
        _;
    }

    modifier inState(TenderState _state) {
        if (state != _state) revert InvalidState();
        _;
    }

    // --- Constructor ---
    constructor(
        uint256 _tenderId,
        TenderConfig memory _config,
        TenderSpecification memory _spec,
        address _registry,
        address _escrow,
        address _winnerSink,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_config.deadline > block.timestamp, "Deadline must be future");
        require(_config.maxBidders > 0, "Must allow at least 1 bidder");
        require(_config.maxBidders <= MAX_BIDDERS, "Exceeds max bidders");
        require(_registry != address(0), "registry zero");
        require(_escrow != address(0), "escrow zero");

        tenderId = _tenderId;
        config = _config;
        spec = _spec;
        registry = BidderRegistry(_registry);
        escrow = BidEscrow(_escrow);
        winnerSink = _winnerSink; // optional — may be address(0)
        state = TenderState.Bidding;
    }

    // --- Bidding ---

    function submitBid(
        externalEuint64 _encPrice,
        bytes calldata _priceProof,
        externalEuint32 _encYears,
        bytes calldata _yearsProof,
        externalEuint32 _encProjects,
        bytes calldata _projectsProof,
        externalEuint64 _encBond,
        bytes calldata _bondProof
    ) external onlyVerified beforeDeadline inState(TenderState.Bidding) whenNotPaused nonReentrant {
        if (bidders.length >= config.maxBidders) revert MaxBiddersReached();

        // Check escrow deposit
        if (config.escrowAmount > 0) {
            uint256 deposited = escrow.deposits(tenderId, msg.sender);
            if (deposited < config.escrowAmount) revert EscrowRequired();
        }

        // Check reputation
        if (config.minReputation > 0) {
            uint256 rep = registry.getReputationScore(msg.sender);
            if (rep < config.minReputation) revert InsufficientReputation();
        }

        // Convert encrypted inputs
        euint64 encPrice = FHE.fromExternal(_encPrice, _priceProof);
        euint32 encYears = FHE.fromExternal(_encYears, _yearsProof);
        euint32 encProjects = FHE.fromExternal(_encProjects, _projectsProof);
        euint64 encBond = FHE.fromExternal(_encBond, _bondProof);

        // Allow this contract to operate on the ciphertexts
        FHE.allowThis(encPrice);
        FHE.allowThis(encYears);
        FHE.allowThis(encProjects);
        FHE.allowThis(encBond);

        // Allow the bidder to read their own encrypted data
        FHE.allow(encPrice, msg.sender);
        FHE.allow(encYears, msg.sender);
        FHE.allow(encProjects, msg.sender);
        FHE.allow(encBond, msg.sender);

        if (hasBid[msg.sender]) {
            // Update existing bid
            bids[msg.sender].encPrice = encPrice;
            bids[msg.sender].encYears = encYears;
            bids[msg.sender].encProjects = encProjects;
            bids[msg.sender].encBond = encBond;
            bids[msg.sender].version++;
            bids[msg.sender].timestamp = block.timestamp;

            emit BidUpdated(msg.sender, bids[msg.sender].version);
        } else {
            // New bid
            bids[msg.sender] = BidData({
                encPrice: encPrice,
                encYears: encYears,
                encProjects: encProjects,
                encBond: encBond,
                timestamp: block.timestamp,
                version: 1
            });
            bidders.push(msg.sender);
            hasBid[msg.sender] = true;

            emit BidSubmitted(msg.sender, block.timestamp);
        }

        // Record bid in registry if authorized
        if (registry.authorizedCallers(address(this))) {
            registry.recordBid(msg.sender);
        }
    }

    // --- Evaluation ---

    function evaluateBatch(
        uint256 startIdx,
        uint256 endIdx
    ) external onlyOwner afterDeadline whenNotPaused {
        if (state == TenderState.Bidding) {
            state = TenderState.Evaluating;
        }
        if (state != TenderState.Evaluating) revert NotEvaluating();
        if (startIdx >= endIdx) revert InvalidRange();
        if (endIdx > bidders.length) revert EndExceedsBidders();
        if (startIdx != evaluatedCount) revert MustEvaluateInOrder();
        if (endIdx - startIdx > MAX_BATCH_SIZE) revert BatchTooLarge(endIdx - startIdx, MAX_BATCH_SIZE);

        for (uint256 i = startIdx; i < endIdx; i++) {
            address bidder = bidders[i];
            BidData storage bid = bids[bidder];

            // Gate check: minimum requirements
            ebool yearsOk = FHE.ge(bid.encYears, FHE.asEuint32(config.minYears));
            ebool projectsOk = FHE.ge(bid.encProjects, FHE.asEuint32(config.minProjects));
            ebool bondOk = FHE.ge(bid.encBond, FHE.asEuint64(config.minBond));
            ebool qualified = FHE.and(FHE.and(yearsOk, projectsOk), bondOk);

            // If not qualified, set effective price to max
            euint64 maxPrice = FHE.asEuint64(type(uint64).max);
            euint64 effectivePrice = FHE.select(qualified, bid.encPrice, maxPrice);

            if (i == 0) {
                // First bidder — initialize
                currentMinPrice = effectivePrice;
                currentWinnerIdx = FHE.asEuint32(0);
            } else {
                // Compare with current minimum
                ebool isLower = FHE.lt(effectivePrice, currentMinPrice);
                currentMinPrice = FHE.select(isLower, effectivePrice, currentMinPrice);
                currentWinnerIdx = FHE.select(
                    isLower,
                    FHE.asEuint32(uint32(i)),
                    currentWinnerIdx
                );
            }
        }

        evaluatedCount = endIdx;

        // CRITICAL: Persist contract-side ACL on the running min/winner ciphertexts so
        // the next batch (or requestReveal) can operate on them. Without these calls,
        // each new handle produced by FHE.select would only carry transient ACL valid
        // within the current transaction — breaking multi-batch evaluation in production.
        FHE.allowThis(currentMinPrice);
        FHE.allowThis(currentWinnerIdx);

        emit EvaluationBatchCompleted(startIdx, endIdx);

        if (evaluatedCount == bidders.length) {
            evaluationComplete = true;
            emit EvaluationCompleted(bidders.length);
        }
    }

    // --- Reveal ---

    function requestReveal() external onlyOwner {
        if (!evaluationComplete) revert EvaluationNotComplete();
        if (revealed) revert AlreadyRevealed();

        FHE.makePubliclyDecryptable(currentWinnerIdx);
        FHE.makePubliclyDecryptable(currentMinPrice);

        winnerIdxHandle = FHE.toBytes32(currentWinnerIdx);
        winnerPriceHandle = FHE.toBytes32(currentMinPrice);
        revealRequestedAt = block.timestamp;

        emit RevealRequested(winnerIdxHandle, winnerPriceHandle);
    }

    function revealWinner(
        uint256 winnerIdx,
        uint256 price,
        bytes calldata decryptionProof
    ) external onlyOwner {
        require(!revealed, "Already revealed");
        require(winnerIdx < bidders.length, "Winner index out of bounds");

        // Build handles list and verify KMS signatures
        bytes32[] memory handlesList = new bytes32[](2);
        handlesList[0] = winnerIdxHandle;
        handlesList[1] = winnerPriceHandle;

        bytes memory cleartexts = abi.encode(winnerIdx, price);
        FHE.checkSignatures(handlesList, cleartexts, decryptionProof);

        winnerAddress = bidders[winnerIdx];
        revealedPrice = price;
        revealed = true;
        state = TenderState.Revealed;

        // Record win in registry if authorized
        if (registry.authorizedCallers(address(this))) {
            registry.recordWin(winnerAddress);
        }

        // Auto-forward to escalation/escrow sink if configured. Failures are tolerated
        // because they must not block reveal — the winner is still surfaced on-chain
        // and the sink can be re-attempted manually via the sink contract directly.
        if (winnerSink != address(0)) {
            (bool ok, bytes memory ret) = winnerSink.call(
                abi.encodeWithSelector(WINNER_SINK_SELECTOR, tenderId, winnerAddress)
            );
            if (!ok) {
                emit WinnerSinkForwardFailed(winnerSink, ret);
            }
        }

        emit WinnerRevealed(winnerAddress, price);
    }

    /// @notice Owner-set destination contract for winner propagation. Must implement
    ///         `setTenderWinner(uint256, address)` (e.g. PriceEscalation). Pass
    ///         `address(0)` to disable forwarding.
    function setWinnerSink(address _sink) external onlyOwner {
        winnerSink = _sink;
        emit WinnerSinkSet(_sink);
    }

    /// @notice Owner can adjust the reveal timeout within sane bounds. Reducing it
    ///         too aggressively risks racing the KMS roundtrip; raising it too high
    ///         defeats the liveness guarantee.
    function setRevealTimeout(uint256 _seconds) external onlyOwner {
        if (_seconds < 1 days || _seconds > 30 days) revert InvalidTimeout();
        revealTimeout = _seconds;
        emit RevealTimeoutSet(_seconds);
    }

    /// @notice Permissionless escape hatch: if the owner has called {requestReveal}
    ///         but failed to deliver the KMS-signed `revealWinner` proof within
    ///         `revealTimeout`, anyone may call this to mark the tender Cancelled
    ///         so bidders can recover their escrows via the BidEscrow refund path.
    /// @dev Removes single-point-of-liveness from the tender owner.
    function forceCancelStuckReveal() external {
        if (revealRequestedAt == 0) revert RevealNotRequested();
        if (revealed) revert AlreadyRevealed();
        if (block.timestamp < revealRequestedAt + revealTimeout) revert RevealTimeoutNotElapsed();
        state = TenderState.Cancelled;
        emit StuckRevealForceCancelled(msg.sender, block.timestamp - revealRequestedAt);
        emit TenderCancelled(block.timestamp);
    }

    // --- Views ---

    function getMyBid() external view returns (
        euint64 encPrice,
        euint32 encYears,
        euint32 encProjects,
        euint64 encBond,
        uint256 timestamp,
        uint256 version
    ) {
        BidData storage bid = bids[msg.sender];
        return (
            bid.encPrice,
            bid.encYears,
            bid.encProjects,
            bid.encBond,
            bid.timestamp,
            bid.version
        );
    }

    function getBidVersion(address bidder) external view returns (uint256) {
        return bids[bidder].version;
    }

    function getConfig() external view returns (TenderConfig memory) {
        return config;
    }

    function getSpec() external view returns (TenderSpecification memory) {
        return spec;
    }

    function getBidders(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory) {
        uint256 total = bidders.length;
        if (offset >= total) {
            return new address[](0);
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = bidders[offset + i];
        }
        return result;
    }

    // --- Admin ---

    function cancelTender() external onlyOwner {
        state = TenderState.Cancelled;
        emit TenderCancelled(block.timestamp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
