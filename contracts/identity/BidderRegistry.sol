// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title BidderRegistry
 * @notice Manages bidder identity, verification, and on-chain reputation.
 */
contract BidderRegistry is Ownable2Step {
    // --- Structs ---
    struct BidderProfile {
        bool verified;
        uint256 totalBids;
        uint256 totalWins;
        uint256 totalSlashes;
        uint256 completedOnTime;
        uint256 registeredAt;
    }

    // --- State ---
    mapping(address => BidderProfile) public profiles;
    address[] public allBidders;
    mapping(address => uint256) internal _bidderIndex;
    mapping(address => bool) public authorizedCallers;

    /// @notice Single contract permitted to authorize new tender callers (typically
    ///         the TenderFactory). Owner-set, can be cleared by setting to zero.
    /// @dev Replaces the prior `onlyOwnerOrAuthorized` design which allowed *any*
    ///      authorized caller to escalate by adding more callers — a privilege-
    ///      escalation surface that would let a compromised tender contract
    ///      contaminate the entire registry.
    address public tenderManager;

    // --- Events ---
    event BidderRegistered(address indexed bidder);
    event BidderRemoved(address indexed bidder);
    event AuthorizedCallerAdded(address indexed caller);
    event AuthorizedCallerRemoved(address indexed caller);
    event TenderManagerSet(address indexed manager);
    event BidRecorded(address indexed bidder);
    event WinRecorded(address indexed bidder);
    event SlashRecorded(address indexed bidder);
    event CompletionRecorded(address indexed bidder);

    // --- Errors ---
    error ZeroAddress();
    error BidderAlreadyRegistered();
    error BidderNotRegistered();
    error CallerNotAuthorized();

    // --- Modifiers ---
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert CallerNotAuthorized();
        _;
    }

    modifier onlyOwnerOrTenderManager() {
        if (msg.sender != owner() && msg.sender != tenderManager) {
            revert CallerNotAuthorized();
        }
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    // --- Admin ---

    function registerBidder(address bidder) external onlyOwner {
        if (bidder == address(0)) revert ZeroAddress();
        if (profiles[bidder].verified) revert BidderAlreadyRegistered();

        profiles[bidder] = BidderProfile({
            verified: true,
            totalBids: 0,
            totalWins: 0,
            totalSlashes: 0,
            completedOnTime: 0,
            registeredAt: block.timestamp
        });

        _bidderIndex[bidder] = allBidders.length;
        allBidders.push(bidder);

        emit BidderRegistered(bidder);
    }

    function removeBidder(address bidder) external onlyOwner {
        if (!profiles[bidder].verified) revert BidderNotRegistered();

        profiles[bidder].verified = false;

        // Swap-and-pop
        uint256 index = _bidderIndex[bidder];
        uint256 lastIndex = allBidders.length - 1;

        if (index != lastIndex) {
            address lastBidder = allBidders[lastIndex];
            allBidders[index] = lastBidder;
            _bidderIndex[lastBidder] = index;
        }

        allBidders.pop();
        delete _bidderIndex[bidder];

        emit BidderRemoved(bidder);
    }

    /// @notice Authorize a contract to record bids/wins/slashes/completions.
    /// @dev Restricted to {owner} or {tenderManager} (typically the factory). Other
    ///      authorized callers cannot themselves add more callers — closing the
    ///      privilege-escalation path that existed under the prior
    ///      `onlyOwnerOrAuthorized` design.
    function addAuthorizedCaller(address caller) external onlyOwnerOrTenderManager {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = true;
        emit AuthorizedCallerAdded(caller);
    }

    /// @notice Owner-only: nominate the TenderFactory (or equivalent) as the sole
    ///         contract permitted to call {addAuthorizedCaller}. Pass `address(0)`
    ///         to revoke the role and require all future authorizations to flow
    ///         directly through the owner.
    function setTenderManager(address _tenderManager) external onlyOwner {
        tenderManager = _tenderManager;
        emit TenderManagerSet(_tenderManager);
    }

    function removeAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit AuthorizedCallerRemoved(caller);
    }

    // --- Recording ---

    function recordBid(address bidder) external onlyAuthorized {
        if (!profiles[bidder].verified) revert BidderNotRegistered();
        profiles[bidder].totalBids++;
        emit BidRecorded(bidder);
    }

    function recordWin(address bidder) external onlyAuthorized {
        if (!profiles[bidder].verified) revert BidderNotRegistered();
        profiles[bidder].totalWins++;
        emit WinRecorded(bidder);
    }

    function recordSlash(address bidder) external onlyAuthorized {
        if (!profiles[bidder].verified) revert BidderNotRegistered();
        profiles[bidder].totalSlashes++;
        emit SlashRecorded(bidder);
    }

    function recordCompletion(address bidder) external onlyAuthorized {
        if (!profiles[bidder].verified) revert BidderNotRegistered();
        profiles[bidder].completedOnTime++;
        emit CompletionRecorded(bidder);
    }

    // --- Views ---

    function isVerified(address bidder) external view returns (bool) {
        return profiles[bidder].verified;
    }

    function getProfile(address bidder) external view returns (BidderProfile memory) {
        return profiles[bidder];
    }

    /**
     * @notice Calculate a bidder's reputation score (0-100).
     * @dev Arithmetic is safe against overflow: Solidity 0.8+ has built-in
     *      overflow/underflow checks on all arithmetic operations. The
     *      multiplication `(p.totalWins + p.completedOnTime) * 100` will
     *      revert automatically if it exceeds uint256 max, which is only
     *      possible with astronomically large values (~1.15e75 bids).
     */
    function getReputationScore(address bidder) external view returns (uint256) {
        BidderProfile storage p = profiles[bidder];
        if (!p.verified) return 0;

        // Safe: Solidity 0.8+ reverts on overflow for all arithmetic ops
        uint256 numerator = (p.totalWins + p.completedOnTime) * 100;
        uint256 denominator = p.totalBids + p.totalSlashes * 2;

        if (denominator == 0) return 50; // Default score for new bidders

        uint256 score = numerator / denominator;
        return score > 100 ? 100 : score;
    }

    function bidderCount() external view returns (uint256) {
        return allBidders.length;
    }
}
