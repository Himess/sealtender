// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Test-only stub that mimics EncryptedTender's `state()` accessor so
///         BidEscrow.claimRefund can be exercised without a full FHE-stack
///         deployment.
contract MockTenderStateReader {
    uint8 public state;

    function setState(uint8 _state) external {
        state = _state;
    }
}
