// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DisputeStatus} from "../interfaces/ISealTender.sol";

interface IDisputeManager {
    function resolveDispute(uint256 disputeId, DisputeStatus resolution) external;
    function disputeCount() external view returns (uint256);
}

/**
 * @title ArbitrationSafe
 * @notice N-of-M multi-sig dispute resolution gate. Replaces the unilateral
 *         "owner-resolves-everything" pattern in DisputeManager with a quorum
 *         of independent arbitrators (Kamu Ihale Kurumu seat + Idari Mahkeme
 *         seat + 2 sektor temsilcisi seats + 1 STK seat in production target).
 *
 *         Each arbitrator independently votes on (disputeId, resolution); when
 *         {THRESHOLD} matching votes accumulate the contract self-executes the
 *         resolution against the wired DisputeManager via its `courtAuthority`
 *         path. No single arbitrator can slash a contractor's escrow alone.
 *
 *         Why this matters: 4734 sayili Kamu Ihale Kanunu requires commission
 *         decisions for disputes -- a single owner key signing slash txs would
 *         be statutorily non-compliant. ArbitrationSafe is the on-chain
 *         expression of that commission requirement.
 */
contract ArbitrationSafe is Ownable2Step, ReentrancyGuard {
    // --- Constants ---
    /// @notice Quorum required to execute a resolution. Tuned to be a strict
    ///         majority (3 of 5) so collusion among any 2 seats cannot push
    ///         a slash through.
    uint8 public constant THRESHOLD = 3;
    uint8 public constant MAX_ARBITRATORS = 5;

    // --- State ---
    IDisputeManager public immutable disputeManager;

    /// @notice Active arbitrator set. Order matches the seat assignment for
    ///         off-chain governance docs (see README "Arbitration roster").
    address[] public arbitrators;
    mapping(address => bool) public isArbitrator;

    /// @notice Per-dispute, per-arbitrator vote record. The vote payload is the
    ///         resolution byte itself, so independent arbitrators must AGREE on
    ///         BOTH the disputeId AND the resolution to converge to threshold.
    ///         votes[disputeId][resolution][arbitrator] = true.
    mapping(uint256 => mapping(DisputeStatus => mapping(address => bool))) public votes;

    /// @notice Tally per (disputeId, resolution). Cheaper than scanning all
    ///         arbitrators on every vote.
    mapping(uint256 => mapping(DisputeStatus => uint8)) public voteCount;

    /// @notice Once executed, further votes for the same dispute are no-ops.
    mapping(uint256 => bool) public executed;

    // --- Events ---
    event ArbitratorAdded(address indexed arbitrator);
    event ArbitratorRemoved(address indexed arbitrator);
    event Voted(
        address indexed arbitrator,
        uint256 indexed disputeId,
        DisputeStatus resolution,
        uint8 newCount
    );
    event ResolutionExecuted(
        uint256 indexed disputeId,
        DisputeStatus resolution,
        address indexed lastVoter
    );

    // --- Errors ---
    error NotArbitrator();
    error AlreadyVoted();
    error AlreadyExecuted();
    error InvalidArbitratorCount(uint256 supplied);
    error DuplicateArbitrator(address arbitrator);
    error ZeroAddress();
    error ArbitratorNotFound();
    error InvalidResolution();

    constructor(address _disputeManager, address[] memory _arbitrators)
        Ownable(msg.sender)
    {
        if (_disputeManager == address(0)) revert ZeroAddress();
        if (_arbitrators.length == 0 || _arbitrators.length > MAX_ARBITRATORS) {
            revert InvalidArbitratorCount(_arbitrators.length);
        }
        disputeManager = IDisputeManager(_disputeManager);

        for (uint256 i = 0; i < _arbitrators.length; i++) {
            address a = _arbitrators[i];
            if (a == address(0)) revert ZeroAddress();
            if (isArbitrator[a]) revert DuplicateArbitrator(a);
            arbitrators.push(a);
            isArbitrator[a] = true;
            emit ArbitratorAdded(a);
        }
    }

    // --- Voting ---

    /// @notice Cast a vote for `(disputeId, resolution)`. When the THRESHOLD
    ///         is reached (3 of 5 by default), the resolution is executed
    ///         atomically in the same tx via `disputeManager.resolveDispute`.
    /// @dev Only `Slashed`, `Frozen`, or `Dismissed` resolutions accepted --
    ///      `Open` / `Investigating` would be a no-op.
    function voteResolve(uint256 disputeId, DisputeStatus resolution)
        external
        nonReentrant
    {
        if (!isArbitrator[msg.sender]) revert NotArbitrator();
        if (executed[disputeId]) revert AlreadyExecuted();
        if (
            resolution != DisputeStatus.Slashed &&
            resolution != DisputeStatus.Frozen &&
            resolution != DisputeStatus.Dismissed
        ) {
            revert InvalidResolution();
        }
        if (votes[disputeId][resolution][msg.sender]) revert AlreadyVoted();

        votes[disputeId][resolution][msg.sender] = true;
        uint8 newCount = ++voteCount[disputeId][resolution];
        emit Voted(msg.sender, disputeId, resolution, newCount);

        if (newCount >= THRESHOLD) {
            executed[disputeId] = true;
            disputeManager.resolveDispute(disputeId, resolution);
            emit ResolutionExecuted(disputeId, resolution, msg.sender);
        }
    }

    // --- Admin ---

    /// @notice Owner can rotate seats post-deployment (e.g. when a sector
    ///         representative term ends). Production deployments should set
    ///         the owner to a higher governance contract before mainnet.
    function addArbitrator(address arbitrator) external onlyOwner {
        if (arbitrator == address(0)) revert ZeroAddress();
        if (isArbitrator[arbitrator]) revert DuplicateArbitrator(arbitrator);
        if (arbitrators.length >= MAX_ARBITRATORS) {
            revert InvalidArbitratorCount(arbitrators.length + 1);
        }
        arbitrators.push(arbitrator);
        isArbitrator[arbitrator] = true;
        emit ArbitratorAdded(arbitrator);
    }

    function removeArbitrator(address arbitrator) external onlyOwner {
        if (!isArbitrator[arbitrator]) revert ArbitratorNotFound();
        isArbitrator[arbitrator] = false;
        // Swap-and-pop so the array stays compact.
        uint256 len = arbitrators.length;
        for (uint256 i = 0; i < len; i++) {
            if (arbitrators[i] == arbitrator) {
                if (i != len - 1) arbitrators[i] = arbitrators[len - 1];
                arbitrators.pop();
                break;
            }
        }
        emit ArbitratorRemoved(arbitrator);
    }

    // --- Views ---

    function arbitratorCount() external view returns (uint256) {
        return arbitrators.length;
    }

    function getArbitrators() external view returns (address[] memory) {
        return arbitrators;
    }

    function hasVoted(uint256 disputeId, DisputeStatus resolution, address arbitrator)
        external
        view
        returns (bool)
    {
        return votes[disputeId][resolution][arbitrator];
    }
}
