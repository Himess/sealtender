// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, euint32, ebool, externalEuint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {TenderConfig, TenderState} from "../interfaces/ISealTender.sol";
import {BidderRegistry} from "../identity/BidderRegistry.sol";
import {BidEscrow} from "./BidEscrow.sol";

/**
 * @title EncryptedTender
 * @notice FHE-encrypted sealed-bid tender with on-chain evaluation.
 */
contract EncryptedTender is ZamaEthereumConfig, Ownable2Step, Pausable {
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
    TenderState public state;
    BidderRegistry public registry;
    BidEscrow public escrow;

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
        address _registry,
        address _escrow
    ) Ownable(msg.sender) {
        require(_config.deadline > block.timestamp, "Deadline must be future");
        require(_config.maxBidders > 0, "Must allow at least 1 bidder");
        require(_config.maxBidders <= 10, "Max 10 bidders");

        tenderId = _tenderId;
        config = _config;
        registry = BidderRegistry(_registry);
        escrow = BidEscrow(_escrow);
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
    ) external onlyVerified beforeDeadline inState(TenderState.Bidding) whenNotPaused {
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

        emit WinnerRevealed(winnerAddress, price);
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
