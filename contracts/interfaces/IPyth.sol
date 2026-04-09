// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IPyth
 * @notice Minimal Pyth Network interface for price feed reading.
 * @dev Local copy to avoid npm dependency. Full interface at github.com/pyth-network/pyth-sdk-solidity
 */
interface IPyth {
    struct Price {
        int64 price;       // Price value
        uint64 conf;       // Confidence interval
        int32 expo;        // Price exponent (e.g., -8 means price * 10^-8)
        uint256 publishTime; // Unix timestamp
    }

    /**
     * @notice Returns the price for a given price feed ID, reverting if not updated within validTimePeriod
     */
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price);

    /**
     * @notice Returns the EMA price for a given feed ID
     */
    function getEmaPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price);
}
