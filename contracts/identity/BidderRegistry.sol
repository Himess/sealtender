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

    // --- Events ---
    event BidderRegistered(address indexed bidder);
    event BidderRemoved(address indexed bidder);
    event AuthorizedCallerAdded(address indexed caller);
    event AuthorizedCallerRemoved(address indexed caller);
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

    modifier onlyOwnerOrAuthorized() {
        if (msg.sender != owner() && !authorizedCallers[msg.sender]) {
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

    function addAuthorizedCaller(address caller) external onlyOwnerOrAuthorized {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = true;
        emit AuthorizedCallerAdded(caller);
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

    function getReputationScore(address bidder) external view returns (uint256) {
        BidderProfile storage p = profiles[bidder];
        if (!p.verified) return 0;

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
