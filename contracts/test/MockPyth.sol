// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IPyth} from "../interfaces/IPyth.sol";

contract MockPyth is IPyth {
    mapping(bytes32 => Price) private _prices;

    function setPrice(bytes32 id, int64 price, uint64 conf, int32 expo, uint256 publishTime) external {
        _prices[id] = Price(price, conf, expo, publishTime);
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view override returns (Price memory) {
        Price memory p = _prices[id];
        require(p.publishTime > 0, "No price");
        require(block.timestamp - p.publishTime <= age, "Stale price");
        return p;
    }

    function getEmaPriceNoOlderThan(bytes32 id, uint256 age) external view override returns (Price memory) {
        return this.getPriceNoOlderThan(id, age);
    }
}
