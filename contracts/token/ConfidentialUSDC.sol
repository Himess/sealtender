// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, externalEuint64, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConfidentialUSDC
 * @notice FHE-encrypted ERC-7984 wrapper around USDC. Built on OpenZeppelin's
 *         {ERC7984ERC20Wrapper} (v0.4.0), the canonical Zama-recommended pattern
 *         for ERC-20 → ERC-7984 wrapping.
 *
 *         Inherited surface (no reimplementation):
 *           wrap(to, amount)                                 — pulls USDC, mints cUSDC at {rate}
 *           unwrap(from, to, euint64)                        — queues unwrap (own ciphertext)
 *           unwrap(from, to, externalEuint64, inputProof)    — queues unwrap (external ct + zk proof)
 *           finalizeUnwrap(requestId, cleartext, kmsProof)   — settles after KMS-signed proof
 *           onTransferReceived(...)                          — ERC-1363 transferAndCall hook
 *           rate(), underlying(), inferredTotalSupply(),
 *           maxTotalSupply(), unwrapRequester(),
 *           unwrapAmount(), supportsInterface(...)
 *
 *         Local additions:
 *           - Pausable hooks on wrap and the internal _unwrap, gated by
 *             {Ownable2Step}. {finalizeUnwrap} is intentionally NOT pausable so
 *             in-flight unwrap requests can always settle and never strand user
 *             funds in encrypted limbo.
 *           - Reentrancy guard on wrap and the internal _unwrap.
 *           - The underlying USDC is immutable per ERC7984ERC20Wrapper's
 *             contract — to swap underlying, deploy a fresh ConfidentialUSDC.
 *             No on-chain "propose/execute" mechanism is added here because
 *             pretending to support a swap that the parent forbids would be
 *             deceptive.
 *
 *         No faucet — production cUSDC is always 1:1 backed by real USDC.
 *         For Sepolia testing, acquire test USDC from Circle's official faucet
 *         at https://faucet.circle.com (USDC token: 0x1c7D…7238).
 */
contract ConfidentialUSDC is
    ZamaEthereumConfig,
    ERC7984ERC20Wrapper,
    Ownable2Step,
    Pausable,
    ReentrancyGuard
{
    constructor(address initialOwner, IERC20 underlying_)
        ERC7984("Confidential USDC", "cUSDC", "")
        ERC7984ERC20Wrapper(underlying_)
        Ownable(initialOwner)
    {}

    // ─── Wrap (Pausable + reentrancy-guarded) ──────────────────────

    /// @inheritdoc ERC7984ERC20Wrapper
    /// @dev Pause + reentrancy hook on top of the canonical wrap. The parent
    ///      pulls real USDC from `msg.sender` then mints encrypted cUSDC to
    ///      `to` — this contract holds USDC reserves equal to
    ///      `confidentialTotalSupply * rate()` at all times.
    function wrap(address to, uint256 amount)
        public
        override
        nonReentrant
        whenNotPaused
        returns (euint64)
    {
        return super.wrap(to, amount);
    }

    /// @dev ERC-1363 transferAndCall callback. We reuse the parent implementation
    ///      verbatim but gate it through the same pause/reentrancy hooks as
    ///      {wrap} so the alternate entry path can't bypass operational halts.
    function onTransferReceived(
        address operator,
        address from,
        uint256 amount,
        bytes calldata data
    ) public override nonReentrant whenNotPaused returns (bytes4) {
        return super.onTransferReceived(operator, from, amount, data);
    }

    // ─── Unwrap (Pausable + reentrancy-guarded at the internal hook) ─────

    /// @inheritdoc ERC7984ERC20Wrapper
    /// @dev Centralizing pause + reentrancy on the internal {_unwrap} covers
    ///      BOTH public unwrap entries (the euint64 variant and the
    ///      externalEuint64 + inputProof variant) without duplicating the
    ///      modifier on each — matching the canonical override site
    ///      recommended by OpenZeppelin's confidential-contracts examples.
    function _unwrap(address from, address to, euint64 amount)
        internal
        override
        nonReentrant
        whenNotPaused
        returns (bytes32)
    {
        return super._unwrap(from, to, amount);
    }

    /// @dev {finalizeUnwrap} is INTENTIONALLY NOT pausable. Once {_unwrap}
    ///      has burnt the encrypted balance and queued the request, the user
    ///      has irreversibly committed; blocking finalize would freeze their
    ///      underlying USDC indefinitely. The parent's {finalizeUnwrap}
    ///      already validates the KMS-signed decryption proof and is
    ///      idempotent (delete-then-transfer pattern), so re-entering it
    ///      cannot double-spend.

    // ─── Pause control ─────────────────────────────────────────────

    /// @notice Halt new wraps and unwrap requests. In-flight unwrap requests
    ///         remain settle-able through {finalizeUnwrap}.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
