// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title CollisionDetector
 * @notice Detects bid price collisions using FHE encrypted comparisons.
 */
contract CollisionDetector is ZamaEthereumConfig, Ownable2Step {
    // --- State ---
    mapping(uint256 => bool) public collisionChecked;
    mapping(uint256 => bool) public collisionDetected;
    mapping(uint256 => bytes32) public collisionHandle;

    // --- Events ---
    event CollisionCheckStarted(uint256 indexed tenderId, uint256 bidCount);
    event CollisionCheckCompleted(uint256 indexed tenderId, bool hasCollision);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Check for price collisions among encrypted bid prices.
     * @param tenderId The tender to check
     * @param encPrices Array of encrypted price inputs from each bidder
     */
    function checkCollision(
        uint256 tenderId,
        externalEuint64[] calldata encPrices,
        bytes[] calldata proofs
    ) external onlyOwner {
        require(!collisionChecked[tenderId], "Already checked");
        require(encPrices.length >= 2, "Need at least 2 bids");
        require(encPrices.length <= 10, "Max 10 bids");
        require(encPrices.length == proofs.length, "Length mismatch");

        uint256 n = encPrices.length;
        euint64[] memory prices = new euint64[](n);
        for (uint256 i = 0; i < n; i++) {
            prices[i] = FHE.fromExternal(encPrices[i], proofs[i]);
        }

        // O(n^2) pairwise equality check
        ebool anyCollision = FHE.asEbool(false);
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                ebool eq = FHE.eq(prices[i], prices[j]);
                anyCollision = FHE.or(anyCollision, eq);
            }
        }

        FHE.makePubliclyDecryptable(anyCollision);
        collisionChecked[tenderId] = true;
        collisionHandle[tenderId] = FHE.toBytes32(anyCollision);

        emit CollisionCheckStarted(tenderId, n);
    }

    /**
     * @notice Set the collision result after decryption callback.
     * @param tenderId The tender ID
     * @param result Whether a collision was detected
     */
    function setCollisionResult(uint256 tenderId, bool result) external onlyOwner {
        require(collisionChecked[tenderId], "Not checked yet");
        collisionDetected[tenderId] = result;
        emit CollisionCheckCompleted(tenderId, result);
    }

    /**
     * @notice Query collision status for a tender (for cross-contract integration).
     * @param tenderId The tender ID
     * @return checked Whether collision check has been performed
     * @return detected Whether a collision was detected
     */
    function isCollisionDetected(uint256 tenderId) external view returns (bool checked, bool detected) {
        return (collisionChecked[tenderId], collisionDetected[tenderId]);
    }
}
