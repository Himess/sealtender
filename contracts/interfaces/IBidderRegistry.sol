// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IBidderRegistry {
    function isVerified(address bidder) external view returns (bool);
    function getReputationScore(address bidder) external view returns (uint256);
    function authorizedCallers(address caller) external view returns (bool);
    function getProfile(address bidder) external view returns (
        bool verified, uint256 totalBids, uint256 totalWins,
        uint256 totalSlashes, uint256 completedOnTime, uint256 registeredAt
    );
    function bidderCount() external view returns (uint256);
    function recordBid(address bidder) external;
    function recordWin(address bidder) external;
    function recordSlash(address bidder) external;
    function recordCompletion(address bidder) external;
    function addAuthorizedCaller(address caller) external;
}
