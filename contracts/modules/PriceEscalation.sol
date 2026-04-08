// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EscalationRule} from "../interfaces/ISealTender.sol";

/**
 * @title PriceEscalation
 * @notice Handles material price escalation with oracle-based adjustments.
 */
contract PriceEscalation is Ownable2Step {
    // --- Constants ---
    uint256 public constant MAX_PRICE_CHANGE_BPS = 5000; // 50%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // --- State ---
    mapping(uint256 => mapping(bytes32 => EscalationRule)) public rules;
    mapping(uint256 => uint256) public totalEscalationPaid;
    mapping(uint256 => uint256) public tenderPrice;
    mapping(bytes32 => uint256) public latestPrices;

    // --- Events ---
    event EscalationRuleSet(uint256 indexed tenderId, bytes32 materialId);
    event EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment);
    event OraclePriceUpdated(bytes32 indexed materialId, uint256 newPrice);

    // --- Errors ---
    error EscalationCapExceeded();
    error PeriodNotElapsed();
    error NoRuleSet();
    error PriceChangeExceedsLimit();

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    function setTenderPrice(uint256 tenderId, uint256 price) external onlyOwner {
        tenderPrice[tenderId] = price;
    }

    function setEscalationRule(
        uint256 tenderId,
        bytes32 materialId,
        uint256 baselinePrice,
        uint256 thresholdPercent,
        uint256 capPercent,
        uint256 periodSeconds
    ) external onlyOwner {
        rules[tenderId][materialId] = EscalationRule({
            materialId: materialId,
            baselinePrice: baselinePrice,
            thresholdPercent: thresholdPercent,
            capPercent: capPercent,
            periodSeconds: periodSeconds,
            lastEvaluated: block.timestamp
        });
        emit EscalationRuleSet(tenderId, materialId);
    }

    function updateOraclePrice(bytes32 materialId, uint256 newPrice) external onlyOwner {
        uint256 oldPrice = latestPrices[materialId];
        if (oldPrice > 0) {
            // Oracle sanity check: price change must not exceed 50%
            uint256 diff = newPrice > oldPrice ? newPrice - oldPrice : oldPrice - newPrice;
            uint256 maxChange = (oldPrice * MAX_PRICE_CHANGE_BPS) / BPS_DENOMINATOR;
            if (diff > maxChange) revert PriceChangeExceedsLimit();
        }
        latestPrices[materialId] = newPrice;
        emit OraclePriceUpdated(materialId, newPrice);
    }

    // --- Core ---

    function evaluateEscalation(
        uint256 tenderId,
        bytes32 materialId
    ) external onlyOwner returns (uint256 extraPayment) {
        EscalationRule storage rule = rules[tenderId][materialId];
        if (rule.baselinePrice == 0) revert NoRuleSet();
        if (block.timestamp < rule.lastEvaluated + rule.periodSeconds) {
            revert PeriodNotElapsed();
        }

        uint256 currentPrice = latestPrices[materialId];
        if (currentPrice <= rule.baselinePrice) return 0;

        uint256 increase = currentPrice - rule.baselinePrice;
        uint256 increaseBps = (increase * BPS_DENOMINATOR) / rule.baselinePrice;

        if (increaseBps < rule.thresholdPercent) return 0;
        if (increaseBps > rule.capPercent) revert EscalationCapExceeded();

        extraPayment = (tenderPrice[tenderId] * increaseBps) / BPS_DENOMINATOR;
        totalEscalationPaid[tenderId] += extraPayment;
        rule.lastEvaluated = block.timestamp;

        emit EscalationTriggered(tenderId, materialId, extraPayment);
        return extraPayment;
    }

    // --- Views ---

    function getBaselinePrice(
        uint256 tenderId,
        bytes32 materialId
    ) external view returns (uint256) {
        return rules[tenderId][materialId].baselinePrice;
    }

    function getLatestPrice(bytes32 materialId) external view returns (uint256) {
        return latestPrices[materialId];
    }

    function getTotalEscalation(uint256 tenderId) external view returns (uint256) {
        return totalEscalationPaid[tenderId];
    }
}
