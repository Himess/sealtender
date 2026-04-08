// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract MockV3Aggregator {
    int256 private _price;
    uint256 private _updatedAt;
    uint8 private _decimals;

    constructor(uint8 decimals_, int256 initialPrice) {
        _decimals = decimals_;
        _price = initialPrice;
        _updatedAt = block.timestamp;
    }

    function updateAnswer(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 ts) external {
        _updatedAt = ts;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, _price, 0, _updatedAt, 0);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }
}
