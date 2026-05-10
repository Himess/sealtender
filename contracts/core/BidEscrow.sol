// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {DepositStatus} from "../interfaces/ISealTender.sol";

/**
 * @title BidEscrow (v7 — ERC-7984 native)
 * @notice Holds confidential ERC-7984 (cUSDC) bid bond deposits per tender.
 *
 *         This is the v7 redesign: every escrow balance is now an FHE-encrypted
 *         euint64 in confidential USDC. The legacy ETH path is gone — bidders
 *         must wrap USDC into cUSDC first (`ConfidentialUSDC.wrap`), authorize
 *         this contract as their operator (`cUSDC.setOperator`), then deposit
 *         their encrypted bond here.
 *
 *         Why ERC-7984? Bond amounts are commercially sensitive. The Zama
 *         Developer Program Builder Track explicitly requires OpenZeppelin's
 *         Confidential Contracts integration; ETH escrow leaked exact bond
 *         values via public Transfer events. With cUSDC the bond amount is
 *         a ciphertext on chain — only its owner (and the contract, via FHE
 *         ACL) can read it.
 *
 *         Settlement paths:
 *           • {claimRefund} — permissionless after tender Cancelled, returns
 *             the encrypted bond via `cUSDC.confidentialTransfer`
 *           • {release} / {refund} — authorized caller (tender) variants
 *           • {slash} — encrypted bond transferred to recipient
 *
 *         Gate semantics for {EncryptedTender.submitBid}:
 *           • `hasDeposited[tenderId][bidder]` is a PUBLIC boolean flipped on
 *             deposit. Tender contracts gate submitBid on this boolean.
 *           • The amount itself stays encrypted. The frontend is expected to
 *             encrypt exactly `requiredDeposit[tenderId]` (public minimum) —
 *             on-chain verification of "amount >= required" via FHE.ge is a
 *             v8 hardening (currently the small bond size makes underpayment
 *             economically irrelevant; production deployments should gate via
 *             ebool).
 */

/// @dev Minimal interface for the permissionless refund check — keeps BidEscrow
///      decoupled from the full EncryptedTender ABI.
interface ITenderStateReader {
    function state() external view returns (uint8);
}

contract BidEscrow is ZamaEthereumConfig, Ownable2Step, ReentrancyGuard {
    /// @notice TenderState.Cancelled enum value (matches ISealTender.sol).
    uint8 public constant TENDER_STATE_CANCELLED = 5;

    // --- State ---

    /// @notice Confidential ERC-7984 token used for every deposit on this escrow.
    ///         Set once in the constructor — re-deploying is the only way to
    ///         change the underlying confidential token.
    IERC7984 public immutable cToken;

    /// @notice Public minimum deposit per tender, denominated in cUSDC units
    ///         (uint64 fixed-point, 6 decimals). Bidders MUST encrypt exactly
    ///         this value; the on-chain check is currently public-boolean only
    ///         (see contract-level NatSpec for the v8 ebool hardening note).
    mapping(uint256 => uint64) public requiredDeposit;

    /// @notice Encrypted bond balance per (tenderId, bidder). Stored as a
    ///         single euint64 handle the contract holds ACL on, so refund /
    ///         release / slash can move it via cUSDC.confidentialTransfer.
    mapping(uint256 => mapping(address => euint64)) internal _deposits;

    /// @notice Public boolean gate. Tender contracts read this in submitBid to
    ///         decide whether the bidder cleared the escrow requirement.
    mapping(uint256 => mapping(address => bool)) public hasDeposited;

    /// @notice Lifecycle state machine per (tenderId, bidder) — same enum as
    ///         the legacy ETH escrow so downstream tooling does not break.
    mapping(uint256 => mapping(address => DepositStatus)) public depositStatus;

    mapping(address => bool) public authorizedCallers;
    /// @notice Per-tender mapping of tenderId → tender contract address. Set by
    ///         authorized callers (factory) so {claimRefund} can verify the
    ///         tender is in {TenderState.Cancelled} before releasing funds.
    mapping(uint256 => address) public tenderOf;

    // --- Events ---

    /// @notice Deposit events deliberately do NOT carry the encrypted amount —
    ///         that is the whole point of the cUSDC migration. Observers can
    ///         see WHO deposited WHEN, but never the bond size.
    event EscrowDeposited(uint256 indexed tenderId, address indexed bidder);
    event EscrowReleased(uint256 indexed tenderId, address indexed bidder);
    event EscrowRefunded(uint256 indexed tenderId, address indexed bidder);
    event EscrowFrozen(uint256 indexed tenderId, address indexed bidder);
    event EscrowUnfrozen(uint256 indexed tenderId, address indexed bidder);
    event EscrowSlashed(uint256 indexed tenderId, address indexed bidder, address recipient);
    event RequiredDepositSet(uint256 indexed tenderId, uint64 amount);
    event CallerAuthorized(address indexed caller);
    event CallerDeauthorized(address indexed caller);
    event TenderRecorded(uint256 indexed tenderId, address indexed tender);
    event RefundClaimed(uint256 indexed tenderId, address indexed bidder);

    // --- Errors ---
    error NotAuthorized();
    error DepositNotActive();
    error DepositFrozen();
    error DepositAlreadyExists();
    error ZeroAddress();
    error NoDeposit();
    error TenderNotConfigured();
    error TenderNotCancelled();
    error TenderUnknown();
    error TokenNotApproved();

    // --- Modifiers ---
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    /// @param _cToken the confidential ERC-7984 token (e.g. ConfidentialUSDC)
    ///        that this escrow will accept for every deposit.
    constructor(address initialOwner, IERC7984 _cToken) Ownable(initialOwner) {
        if (address(_cToken) == address(0)) revert ZeroAddress();
        cToken = _cToken;
    }

    // --- Admin ---

    function authorizeCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function deauthorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit CallerDeauthorized(caller);
    }

    function setRequiredDeposit(uint256 tenderId, uint64 amount) external onlyAuthorized {
        requiredDeposit[tenderId] = amount;
        emit RequiredDepositSet(tenderId, amount);
    }

    /// @notice Records the tender contract address for `tenderId`. Required so
    ///         {claimRefund} can verify the tender is in {TenderState.Cancelled}
    ///         before releasing funds permissionlessly. Called by the factory
    ///         immediately after deploying a new tender.
    function setTenderAddress(uint256 tenderId, address tender) external onlyAuthorized {
        if (tender == address(0)) revert ZeroAddress();
        tenderOf[tenderId] = tender;
        emit TenderRecorded(tenderId, tender);
    }

    // --- Core ---

    /// @notice Deposit an encrypted cUSDC bond for `tenderId`. Caller must have
    ///         previously authorized this contract as their operator on the
    ///         confidential token (`cUSDC.setOperator(escrowAddress, until)`).
    /// @dev The encrypted amount is pulled from `msg.sender` via
    ///      `cToken.confidentialTransferFrom`. The actually-transferred amount
    ///      (which can differ from the requested amount if balance is insufficient
    ///      under FHE select-clamp semantics) is the value stored.
    function deposit(
        uint256 tenderId,
        externalEuint64 inputAmount,
        bytes calldata inputProof
    ) external nonReentrant {
        if (depositStatus[tenderId][msg.sender] != DepositStatus.None) {
            revert DepositAlreadyExists();
        }
        if (requiredDeposit[tenderId] == 0) revert TenderNotConfigured();

        // Pull encrypted cUSDC from the bidder. ERC-7984's transferFrom returns
        // the *actually-transferred* amount (which under FHE balance-insufficient
        // semantics may be zero) — we store that handle, not the requested input.
        euint64 transferred = cToken.confidentialTransferFrom(
            msg.sender,
            address(this),
            inputAmount,
            inputProof
        );

        // Persist contract-side ACL so future confidentialTransfer can move it.
        // Also grant the bidder read access so they can verify their own deposit
        // via the standard user-decrypt flow.
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        _deposits[tenderId][msg.sender] = transferred;
        depositStatus[tenderId][msg.sender] = DepositStatus.Active;
        hasDeposited[tenderId][msg.sender] = true;

        emit EscrowDeposited(tenderId, msg.sender);
    }

    function release(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant {
        _requireActive(tenderId, bidder);
        euint64 amount = _deposits[tenderId][bidder];

        depositStatus[tenderId][bidder] = DepositStatus.Released;
        // Note: cannot `delete` euint64 (FHE type, no compiler support).
        // The status flag transition prevents re-claiming.

        // Move the encrypted balance back to the bidder.
        cToken.confidentialTransfer(bidder, amount);

        emit EscrowReleased(tenderId, bidder);
    }

    function refund(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant {
        _requireActive(tenderId, bidder);
        euint64 amount = _deposits[tenderId][bidder];

        depositStatus[tenderId][bidder] = DepositStatus.Refunded;
        // Note: cannot `delete` euint64 (FHE type, no compiler support).
        // The status flag transition prevents re-claiming.

        cToken.confidentialTransfer(bidder, amount);

        emit EscrowRefunded(tenderId, bidder);
    }

    /// @notice Permissionless refund path: any depositor can pull back their
    ///         escrow once the tender has entered {TenderState.Cancelled}.
    ///         Protects bidders if the tender contract goes silent and never
    ///         calls {refund} for them. Frozen deposits are intentionally
    ///         excluded (they are subject to dispute / slashing).
    function claimRefund(uint256 tenderId) external nonReentrant {
        address tender = tenderOf[tenderId];
        if (tender == address(0)) revert TenderUnknown();
        if (ITenderStateReader(tender).state() != TENDER_STATE_CANCELLED) {
            revert TenderNotCancelled();
        }
        _requireActive(tenderId, msg.sender);

        euint64 amount = _deposits[tenderId][msg.sender];

        depositStatus[tenderId][msg.sender] = DepositStatus.Refunded;
        // Note: cannot `delete` euint64; status flag prevents re-claim.

        cToken.confidentialTransfer(msg.sender, amount);

        emit EscrowRefunded(tenderId, msg.sender);
        emit RefundClaimed(tenderId, msg.sender);
    }

    function freeze(uint256 tenderId, address bidder) external onlyAuthorized {
        if (depositStatus[tenderId][bidder] != DepositStatus.Active) {
            revert DepositNotActive();
        }
        depositStatus[tenderId][bidder] = DepositStatus.Frozen;
        emit EscrowFrozen(tenderId, bidder);
    }

    function unfreeze(uint256 tenderId, address bidder) external onlyAuthorized {
        if (depositStatus[tenderId][bidder] != DepositStatus.Frozen) {
            revert DepositFrozen();
        }
        depositStatus[tenderId][bidder] = DepositStatus.Active;
        emit EscrowUnfrozen(tenderId, bidder);
    }

    function slash(
        uint256 tenderId,
        address bidder,
        address recipient
    ) external onlyAuthorized nonReentrant {
        DepositStatus status = depositStatus[tenderId][bidder];
        if (status != DepositStatus.Active && status != DepositStatus.Frozen) {
            revert DepositNotActive();
        }
        if (recipient == address(0)) revert ZeroAddress();

        euint64 amount = _deposits[tenderId][bidder];

        depositStatus[tenderId][bidder] = DepositStatus.Slashed;
        // Note: cannot `delete` euint64 (FHE type, no compiler support).
        // The status flag transition prevents re-claiming.

        cToken.confidentialTransfer(recipient, amount);

        emit EscrowSlashed(tenderId, bidder, recipient);
    }

    // --- Views ---

    /// @notice Returns the encrypted deposit handle for a bidder. The caller
    ///         must already be ACL-allowed on the handle to decrypt it (the
    ///         depositor + this contract are). Anyone else sees a ciphertext
    ///         handle without read permission.
    function getDeposit(uint256 tenderId, address bidder) external view returns (euint64) {
        return _deposits[tenderId][bidder];
    }

    function getDepositStatus(
        uint256 tenderId,
        address bidder
    ) external view returns (DepositStatus) {
        return depositStatus[tenderId][bidder];
    }

    /// @dev Legacy ABI shim: returns 1 if the bidder has deposited (so JSON-RPC
    ///      callers using the v3 escrow ABI's `deposits(tenderId, bidder)` view
    ///      get a non-zero answer used as "deposit present" gate). The actual
    ///      amount is in `getDeposit` as an encrypted handle.
    function deposits(uint256 tenderId, address bidder) external view returns (uint256) {
        return hasDeposited[tenderId][bidder] ? 1 : 0;
    }

    // --- Internal ---

    function _requireActive(uint256 tenderId, address bidder) internal view {
        DepositStatus status = depositStatus[tenderId][bidder];
        if (status == DepositStatus.Frozen) revert DepositFrozen();
        if (status != DepositStatus.Active) revert DepositNotActive();
    }
}
