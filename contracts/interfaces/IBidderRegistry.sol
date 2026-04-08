// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IBidderRegistry {
    function isVerified(address bidder) external view returns (bool);
    function getReputationScore(address bidder) external view returns (uint256);
    function authorizedCallers(address caller) external view returns (bool);
}
