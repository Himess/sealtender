// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, euint32, ebool, eaddress, externalEuint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TenderConfig, TenderState, TenderSpecification} from "../interfaces/ISealTender.sol";
import {BidderRegistry} from "../identity/BidderRegistry.sol";
import {BidEscrow} from "./BidEscrow.sol";

/**
 * @title EncryptedTender
 * @notice FHE-encrypted sealed-bid tender with on-chain evaluation.
 */
contract EncryptedTender is ZamaEthereumConfig, Ownable2Step, Pausable, ReentrancyGuard {
    // --- Structs ---
    struct BidData {
        euint64 encPrice;
        euint32 encYears;
        euint32 encProjects;
        euint64 encBond;
        uint256 timestamp;
        uint256 version;
    }

    // --- State ---
    uint256 public tenderId;
    TenderConfig public config;
    TenderSpecification public spec;
    TenderState public state;
    BidderRegistry public registry;
    BidEscrow public escrow;

    /// @notice Optional sink for the revealed winner (e.g. PriceEscalation). If set,
    ///         {revealWinner} forwards the winner via low-level call so escalation
    ///         payouts are wired automatically without a separate admin step.
    address public winnerSink;
    bytes4 public constant WINNER_SINK_SELECTOR = bytes4(keccak256("setTenderWinner(uint256,address)"));

    /// @notice After {requestReveal}, if the owner fails to deliver the KMS-signed
    ///         decryption proof within `revealTimeout`, *anyone* may call
    ///         {forceCancelStuckReveal} to cancel the tender and unlock escrows.
    ///         Removes the single-point-of-liveness on the tender owner.
    uint256 public revealRequestedAt;
    uint256 public revealTimeout = 7 days;

    address[] public bidders;
    mapping(address => BidData) internal bids;
    mapping(address => bool) public hasBid;

    euint64 internal currentMinPrice;
    euint32 internal currentWinnerIdx;
    uint256 public evaluatedCount;
    bool public evaluationComplete;

    address public winnerAddress;
    uint256 public revealedPrice;
    bool public revealed;

    bytes32 public winnerIdxHandle;
    bytes32 public winnerPriceHandle;
    /// @notice Handle for the encrypted winner address ciphertext, derived in
    ///         {evaluateBatch} via FHE.select on eaddress alongside the
    ///         existing currentWinnerIdx. {requestReveal} promotes it to
    ///         publicly-decryptable so {revealWinner} can verify the
    ///         KMS-attested address tuple.
    bytes32 public winnerAddrHandle;
    /// @notice Encrypted-during-evaluation winner address. Holds the running
    ///         FHE.select result through batched evaluation. After
    ///         {requestReveal} this becomes publicly decryptable.
    eaddress internal currentWinnerAddr;
    /// @notice Plaintext winner from the KMS-attested decryption. Captured by
    ///         {revealWinner} but NOT yet visible to public observers via the
    ///         `winnerAddress` getter -- {announceWinner} promotes it after
    ///         the ANNOUNCE_TIMELOCK window. Mirrors 4734 sayili Kamu Ihale
    ///         Kanunu Madde 41: kazanan ilan gunu, evaluation bittigi an degil.
    address internal _pendingWinnerAddress;
    /// @notice Block timestamp when {revealWinner} fired, so the announcement
    ///         timelock can be measured deterministically on chain.
    uint256 public revealedAt;
    /// @notice True after {announceWinner} has been called and the public
    ///         winner notice is in effect. Until then, `winnerAddress` returns
    ///         address(0) even if `revealed == true`.
    bool public announced;
    uint256 public announcedAt;

    // --- v6 transparency mode (code committed, deployment deferred to maintain v5 demo state) ---
    //
    // Three-mode disclosure architecture:
    //   1. DEFAULT (privacy)        — losing bids stay encrypted forever; only winner price + addr surface.
    //   2. PUBLIC AUDIT (this file) — procurement entity calls {publishAllBids} after announce; each
    //                                 bid handle is promoted to publicly-decryptable; a follow-up KMS
    //                                 roundtrip per bidder lands the plaintext via {recordLoserBidPlaintext}.
    //                                 Matches 4734 sayili Kamu Ihale Kanunu Madde 36's transparency
    //                                 requirement when the procurement entity opts in.
    //   3. SELECTIVE (off-chain)    — auditor-scoped FHE.delegateUserDecryption gate; not implemented here
    //                                 because it does not require new state, only an admin-flagged delegation.
    //
    /// @notice True after {publishAllBids} has been called. Once true, individual
    ///         loser bid plaintexts may be landed via {recordLoserBidPlaintext}
    ///         using KMS-signed proofs over the now-public ciphertext handles.
    bool public allBidsPublished;
    /// @notice Plaintext bid prices captured per loser via {recordLoserBidPlaintext}.
    ///         Keyed by bidder address; zero indicates "not yet decrypted on-chain"
    ///         (caller can re-run the KMS roundtrip and submit the proof).
    mapping(address => uint256) public plaintextLoserBids;

    // --- Events ---
    event BidSubmitted(address indexed bidder, uint256 timestamp);
    event BidUpdated(address indexed bidder, uint256 version);
    event EvaluationBatchCompleted(uint256 startIdx, uint256 endIdx);
    event EvaluationCompleted(uint256 totalBidders);
    event RevealRequested(bytes32 idxHandle, bytes32 priceHandle);
    /// @notice Emitted when {requestReveal} or {revealWinner} is called by a
    ///         non-owner address — i.e. the permissionless reveal pipeline
    ///         actually got used. Useful for filtering analytics dashboards on
    ///         "owner-cranked vs community-cranked" reveals.
    event PermissionlessRevealTriggered(address indexed by, bytes32 selector, uint256 elapsedSinceDeadline);
    /// @notice Emitted by {revealWinner} when KMS proof has validated the
    ///         (winnerIdx, price, winnerAddr) triple but BEFORE the public
    ///         announcement window has elapsed. Watchers can use this to
    ///         queue the announceWinner() call once the timelock matures.
    event WinnerRevealed(address winner, uint256 price);
    /// @notice Emitted by {announceWinner} once the ANNOUNCE_TIMELOCK has
    ///         elapsed and the winner identity transitions from "internal,
    ///         pending" to "public, official." Indexers should treat THIS
    ///         event (not WinnerRevealed) as the canonical award notice.
    event WinnerAnnounced(address indexed winner, uint256 price, uint256 announcedAt);
    event TenderCancelled(uint256 timestamp);
    event WinnerSinkSet(address indexed sink);
    event WinnerSinkForwardFailed(address indexed sink, bytes returnData);
    event RevealTimeoutSet(uint256 secondsValue);
    event StuckRevealForceCancelled(address indexed by, uint256 elapsed);
    /// @notice Emitted by {publishAllBids} when the procurement entity opts into
    ///         the transparency-mode disclosure. After this, every bid handle is
    ///         publicly-decryptable and a KMS roundtrip per bidder can land
    ///         plaintexts via {recordLoserBidPlaintext}.
    event AllBidsPublished(uint256 timestamp);
    /// @notice Emitted by {recordLoserBidPlaintext} when a KMS-attested plaintext
    ///         price is committed on-chain for a single bidder. Indexers should
    ///         treat this as the canonical "this losing bid was X TRY" record.
    event LoserBidPublished(address indexed bidder, uint256 plaintextPrice);

    // --- Errors ---
    error NotVerifiedBidder();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InvalidState();
    error MaxBiddersReached();
    error EvaluationNotComplete();
    error AlreadyRevealed();
    error InsufficientReputation();
    error EscrowRequired();
    error NotEvaluating();
    error InvalidRange();
    error EndExceedsBidders();
    error MustEvaluateInOrder();
    error BatchTooLarge(uint256 size, uint256 max);
    error RevealNotRequested();
    error RevealTimeoutNotElapsed();
    error RevealTimelockNotElapsed(uint256 deadline, uint256 timelockEnd, uint256 nowTs);
    error InvalidTimeout();
    error WinnerNotRevealed();
    error AlreadyAnnounced();
    error AnnounceTimelockNotElapsed(uint256 revealedAt, uint256 timelockEnd, uint256 nowTs);
    error WinnerAddressMismatch(uint256 winnerIdx, address kmsAttested, address bidderAtIdx);
    error WinnerNotAnnounced();
    error BidsNotPublished();
    error BidsAlreadyPublished();
    error UnknownBidder();

    /// @notice Hard cap on bidders per tender. Above this gas costs per evaluation
    ///         batch exceed practical block limits even with optimal batching.
    uint256 public constant MAX_BIDDERS = 50;
    /// @notice Maximum bidders processed per evaluateBatch call. Tuned for ~30M gas
    ///         per batch including FHE.lt + FHE.select + FHE.allowThis.
    uint256 public constant MAX_BATCH_SIZE = 10;
    /// @notice Time the bidding-deadline must sit before *anyone* can request the
    ///         winner reveal. Production target: 7 days (gives bidders + watchers
    ///         time to file complaints / dispute). Demo deployments override this
    ///         to a small value (e.g. 60 s) so the timelock-protected permissionless
    ///         flow can be demonstrated end-to-end inside a recording window.
    /// @dev Why permissionless? Removes the tender owner's unilateral power to
    ///      time-manipulate the reveal — owner could otherwise probe encrypted
    ///      state via repeated evaluation orderings before triggering reveal.
    ///      Combined with the existing `forceCancelStuckReveal` escape hatch,
    ///      this makes the entire reveal pipeline owner-independent.
    uint256 public constant REVEAL_TIMELOCK = 60 seconds;
    /// @notice Delay between {revealWinner} (KMS-attested decryption finalised)
    ///         and {announceWinner} (public notice). Modeled on 4734 Kamu
    ///         Ihale Kanunu Madde 41's "kesinlesmis kararin tum istekliler ve
    ///         kamuya ilan edildigi gun" requirement -- gives ~48 h in
    ///         production for objections / commissioning paperwork before the
    ///         winner identity becomes a public-facing fact. Demo build uses
    ///         60 s for live recording.
    uint256 public constant ANNOUNCE_TIMELOCK = 60 seconds;

    // --- Modifiers ---
    modifier onlyVerified() {
        if (!registry.isVerified(msg.sender)) revert NotVerifiedBidder();
        _;
    }

    modifier beforeDeadline() {
        if (block.timestamp >= config.deadline) revert DeadlinePassed();
        _;
    }

    modifier afterDeadline() {
        if (block.timestamp < config.deadline) revert DeadlineNotPassed();
        _;
    }

    modifier inState(TenderState _state) {
        if (state != _state) revert InvalidState();
        _;
    }

    // --- Constructor ---
    constructor(
        uint256 _tenderId,
        TenderConfig memory _config,
        TenderSpecification memory _spec,
        address _registry,
        address _escrow,
        address _winnerSink,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_config.deadline > block.timestamp, "Deadline must be future");
        require(_config.maxBidders > 0, "Must allow at least 1 bidder");
        require(_config.maxBidders <= MAX_BIDDERS, "Exceeds max bidders");
        require(_registry != address(0), "registry zero");
        require(_escrow != address(0), "escrow zero");

        tenderId = _tenderId;
        config = _config;
        spec = _spec;
        registry = BidderRegistry(_registry);
        escrow = BidEscrow(_escrow);
        winnerSink = _winnerSink; // optional — may be address(0)
        state = TenderState.Bidding;
    }

    // --- Bidding ---

    function submitBid(
        externalEuint64 _encPrice,
        bytes calldata _priceProof,
        externalEuint32 _encYears,
        bytes calldata _yearsProof,
        externalEuint32 _encProjects,
        bytes calldata _projectsProof,
        externalEuint64 _encBond,
        bytes calldata _bondProof
    ) external onlyVerified beforeDeadline inState(TenderState.Bidding) whenNotPaused nonReentrant {
        if (bidders.length >= config.maxBidders) revert MaxBiddersReached();

        // Check escrow deposit
        if (config.escrowAmount > 0) {
            uint256 deposited = escrow.deposits(tenderId, msg.sender);
            if (deposited < config.escrowAmount) revert EscrowRequired();
        }

        // Check reputation
        if (config.minReputation > 0) {
            uint256 rep = registry.getReputationScore(msg.sender);
            if (rep < config.minReputation) revert InsufficientReputation();
        }

        // Convert encrypted inputs
        euint64 encPrice = FHE.fromExternal(_encPrice, _priceProof);
        euint32 encYears = FHE.fromExternal(_encYears, _yearsProof);
        euint32 encProjects = FHE.fromExternal(_encProjects, _projectsProof);
        euint64 encBond = FHE.fromExternal(_encBond, _bondProof);

        // Allow this contract to operate on the ciphertexts
        FHE.allowThis(encPrice);
        FHE.allowThis(encYears);
        FHE.allowThis(encProjects);
        FHE.allowThis(encBond);

        // Allow the bidder to read their own encrypted data
        FHE.allow(encPrice, msg.sender);
        FHE.allow(encYears, msg.sender);
        FHE.allow(encProjects, msg.sender);
        FHE.allow(encBond, msg.sender);

        if (hasBid[msg.sender]) {
            // Update existing bid
            bids[msg.sender].encPrice = encPrice;
            bids[msg.sender].encYears = encYears;
            bids[msg.sender].encProjects = encProjects;
            bids[msg.sender].encBond = encBond;
            bids[msg.sender].version++;
            bids[msg.sender].timestamp = block.timestamp;

            emit BidUpdated(msg.sender, bids[msg.sender].version);
        } else {
            // New bid
            bids[msg.sender] = BidData({
                encPrice: encPrice,
                encYears: encYears,
                encProjects: encProjects,
                encBond: encBond,
                timestamp: block.timestamp,
                version: 1
            });
            bidders.push(msg.sender);
            hasBid[msg.sender] = true;

            emit BidSubmitted(msg.sender, block.timestamp);
        }

        // Record bid in registry if authorized
        if (registry.authorizedCallers(address(this))) {
            registry.recordBid(msg.sender);
        }
    }

    // --- Evaluation ---

    /// @notice Permissionless after deadline. Any account may crank evaluation
    ///         in batches. The encrypted FHE.lt + FHE.select chain is invariant
    ///         to caller -- the running min/winner ciphertexts are protected by
    ///         FHE.allowThis ACL, so adversaries cannot read intermediate state
    ///         even though they trigger the computation.
    function evaluateBatch(
        uint256 startIdx,
        uint256 endIdx
    ) external afterDeadline whenNotPaused {
        if (state == TenderState.Bidding) {
            state = TenderState.Evaluating;
        }
        if (state != TenderState.Evaluating) revert NotEvaluating();
        if (startIdx >= endIdx) revert InvalidRange();
        if (endIdx > bidders.length) revert EndExceedsBidders();
        if (startIdx != evaluatedCount) revert MustEvaluateInOrder();
        if (endIdx - startIdx > MAX_BATCH_SIZE) revert BatchTooLarge(endIdx - startIdx, MAX_BATCH_SIZE);

        for (uint256 i = startIdx; i < endIdx; i++) {
            address bidder = bidders[i];
            BidData storage bid = bids[bidder];

            // Gate check: minimum requirements
            ebool yearsOk = FHE.ge(bid.encYears, FHE.asEuint32(config.minYears));
            ebool projectsOk = FHE.ge(bid.encProjects, FHE.asEuint32(config.minProjects));
            ebool bondOk = FHE.ge(bid.encBond, FHE.asEuint64(config.minBond));
            ebool qualified = FHE.and(FHE.and(yearsOk, projectsOk), bondOk);

            // If not qualified, set effective price to max
            euint64 maxPrice = FHE.asEuint64(type(uint64).max);
            euint64 effectivePrice = FHE.select(qualified, bid.encPrice, maxPrice);

            // v5: also track winner ADDRESS encrypted alongside winner index.
            // bidder is plaintext today (it's just the address that submitted),
            // but FHE.asEaddress + FHE.select keeps the *running winner* address
            // encrypted so it can be revealed via a 3-handle KMS attestation
            // later instead of being derivable as `bidders[winnerIdx]`.
            eaddress thisAddr = FHE.asEaddress(bidder);

            if (i == 0) {
                // First bidder — initialize
                currentMinPrice = effectivePrice;
                currentWinnerIdx = FHE.asEuint32(0);
                currentWinnerAddr = thisAddr;
            } else {
                // Compare with current minimum
                ebool isLower = FHE.lt(effectivePrice, currentMinPrice);
                currentMinPrice = FHE.select(isLower, effectivePrice, currentMinPrice);
                currentWinnerIdx = FHE.select(
                    isLower,
                    FHE.asEuint32(uint32(i)),
                    currentWinnerIdx
                );
                currentWinnerAddr = FHE.select(isLower, thisAddr, currentWinnerAddr);
            }
        }

        evaluatedCount = endIdx;

        // CRITICAL: Persist contract-side ACL on the running min/winner ciphertexts so
        // the next batch (or requestReveal) can operate on them. Without these calls,
        // each new handle produced by FHE.select would only carry transient ACL valid
        // within the current transaction — breaking multi-batch evaluation in production.
        FHE.allowThis(currentMinPrice);
        FHE.allowThis(currentWinnerIdx);
        FHE.allowThis(currentWinnerAddr);

        emit EvaluationBatchCompleted(startIdx, endIdx);

        if (evaluatedCount == bidders.length) {
            evaluationComplete = true;
            emit EvaluationCompleted(bidders.length);
        }
    }

    // --- Reveal ---

    /// @notice Permissionless after `config.deadline + REVEAL_TIMELOCK`. The
    ///         timelock window gives bidders and observers time to file disputes
    ///         before any reveal can be triggered. Once the window elapses, any
    ///         caller can promote the running winner ciphertexts to publicly-
    ///         decryptable so the KMS threshold quorum can sign the plaintext.
    function requestReveal() external {
        if (!evaluationComplete) revert EvaluationNotComplete();
        if (revealed) revert AlreadyRevealed();
        uint256 timelockEnd = config.deadline + REVEAL_TIMELOCK;
        if (block.timestamp < timelockEnd) {
            revert RevealTimelockNotElapsed(config.deadline, timelockEnd, block.timestamp);
        }

        FHE.makePubliclyDecryptable(currentWinnerIdx);
        FHE.makePubliclyDecryptable(currentMinPrice);
        FHE.makePubliclyDecryptable(currentWinnerAddr);

        winnerIdxHandle = FHE.toBytes32(currentWinnerIdx);
        winnerPriceHandle = FHE.toBytes32(currentMinPrice);
        winnerAddrHandle = FHE.toBytes32(currentWinnerAddr);
        revealRequestedAt = block.timestamp;

        if (msg.sender != owner()) {
            emit PermissionlessRevealTriggered(
                msg.sender,
                this.requestReveal.selector,
                block.timestamp - config.deadline
            );
        }
        emit RevealRequested(winnerIdxHandle, winnerPriceHandle);
    }

    /// @notice Permissionless. Any caller in possession of a KMS-signed
    ///         decryption proof for the winner ciphertexts may finalize the
    ///         reveal. The `FHE.checkSignatures` call is the security gate --
    ///         the (winnerIdx, price, winnerAddr) triple cannot be supplied
    ///         without a 9-of-13 threshold KMS attestation.
    /// @dev v5: now takes 3 handles instead of 2 -- the encrypted winner
    ///      address (currentWinnerAddr) is also attested so the surfaced
    ///      `winnerAddr` parameter is provably the result of evaluation, not
    ///      `bidders[winnerIdx]` derived plaintext. We *also* sanity-check
    ///      `bidders[winnerIdx] == winnerAddr` to catch a coprocessor / KMS
    ///      mismatch (defence in depth -- if both layers agree, the bidder is
    ///      genuine; if they disagree we revert and force investigation).
    /// @dev v5: this function NO LONGER publishes the winner address to the
    ///      public `winnerAddress` getter. Instead it stores it in
    ///      `_pendingWinnerAddress` and waits for {announceWinner} to elapse
    ///      ANNOUNCE_TIMELOCK before flipping it public. This mirrors 4734
    ///      Madde 41's distinction between "kazanan kararlasti" (revealed)
    ///      and "kazanan kamuya ilan edildi" (announced).
    function revealWinner(
        uint256 winnerIdx,
        uint256 price,
        address winnerAddr,
        bytes calldata decryptionProof
    ) external {
        require(!revealed, "Already revealed");
        require(winnerIdx < bidders.length, "Winner index out of bounds");
        require(revealRequestedAt > 0, "Reveal not requested");
        require(winnerAddr != address(0), "Winner addr zero");

        // 3-handle KMS attestation: idx + price + addr must all be threshold-
        // signed for the cleartext tuple submitted by the caller.
        bytes32[] memory handlesList = new bytes32[](3);
        handlesList[0] = winnerIdxHandle;
        handlesList[1] = winnerPriceHandle;
        handlesList[2] = winnerAddrHandle;

        bytes memory cleartexts = abi.encode(winnerIdx, price, winnerAddr);
        FHE.checkSignatures(handlesList, cleartexts, decryptionProof);

        // Cross-check: the KMS-attested address MUST match bidders[winnerIdx].
        // If not, either the FHE coprocessor mis-evaluated or the caller mixed
        // proofs from different tenders -- both are critical bugs we must not
        // silently accept.
        if (bidders[winnerIdx] != winnerAddr) {
            revert WinnerAddressMismatch(winnerIdx, winnerAddr, bidders[winnerIdx]);
        }

        // v5: park winner in pending slot, mark revealed but DO NOT publish
        // the winner address publicly until {announceWinner} fires.
        _pendingWinnerAddress = winnerAddr;
        revealedPrice = price;
        revealed = true;
        revealedAt = block.timestamp;
        state = TenderState.Revealed;

        // Registry win recording + winnerSink forward MOVED to {announceWinner}
        // so reputation impact and downstream payouts also wait for the
        // public-notice window. This keeps the on-chain "this contractor won"
        // signal unified with the public announcement event.

        if (msg.sender != owner()) {
            emit PermissionlessRevealTriggered(
                msg.sender,
                this.revealWinner.selector,
                block.timestamp - config.deadline
            );
        }
        emit WinnerRevealed(winnerAddr, price);
    }

    /// @notice Public-notice trigger. Permissionless after the
    ///         ANNOUNCE_TIMELOCK window elapses. Promotes the
    ///         `_pendingWinnerAddress` set by {revealWinner} into the
    ///         publicly-visible `winnerAddress` slot, records the win in the
    ///         registry, and forwards to the optional winnerSink (typically
    ///         PriceEscalation.setTenderWinner). Indexers should treat the
    ///         emitted WinnerAnnounced event as the canonical award notice.
    /// @dev Called by anyone -- the timelock + revealed flag are the security
    ///      gates. Owner can also call early via {ownerAnnounceEarly} if a
    ///      same-day announcement is required (e.g. emergency procurement).
    function announceWinner() external {
        if (!revealed) revert WinnerNotRevealed();
        if (announced) revert AlreadyAnnounced();
        uint256 timelockEnd = revealedAt + ANNOUNCE_TIMELOCK;
        if (block.timestamp < timelockEnd) {
            revert AnnounceTimelockNotElapsed(revealedAt, timelockEnd, block.timestamp);
        }
        _doAnnounce();
    }

    /// @notice Owner can announce immediately -- same effect as
    ///         {announceWinner} but bypasses the timelock for emergency or
    ///         time-critical procurement. Auditable via the `announcedAt`
    ///         vs `revealedAt` delta in the WinnerAnnounced event.
    function ownerAnnounceEarly() external onlyOwner {
        if (!revealed) revert WinnerNotRevealed();
        if (announced) revert AlreadyAnnounced();
        _doAnnounce();
    }

    function _doAnnounce() internal {
        announced = true;
        announcedAt = block.timestamp;
        winnerAddress = _pendingWinnerAddress;

        // Record win in registry if authorized
        if (registry.authorizedCallers(address(this))) {
            registry.recordWin(winnerAddress);
        }

        // Auto-forward to escalation/escrow sink if configured. Failures are
        // tolerated because they must not block announcement -- the winner is
        // still surfaced on-chain and the sink can be re-attempted manually
        // via the sink contract directly.
        if (winnerSink != address(0)) {
            (bool ok, bytes memory ret) = winnerSink.call(
                abi.encodeWithSelector(WINNER_SINK_SELECTOR, tenderId, winnerAddress)
            );
            if (!ok) {
                emit WinnerSinkForwardFailed(winnerSink, ret);
            }
        }

        emit WinnerAnnounced(winnerAddress, revealedPrice, announcedAt);
    }

    // --- v6 transparency mode (code committed, deployment deferred to maintain v5 demo state) ---

    /// @notice After winner announcement, the procurement entity can opt into
    ///         publishing every losing bid's ciphertext to public-decryptable
    ///         status. Matches 4734 Madde 36's transparency requirement when
    ///         the entity selects the public-audit disclosure mode. When this
    ///         function is NOT called, losing bids stay sealed forever
    ///         (default privacy mode).
    /// @dev We deliberately gate on `announced` (not just `revealed`) so the
    ///      transparency window can never precede the official public notice;
    ///      otherwise observers could correlate ciphertexts with leaked
    ///      identities before the legally-effective award date.
    /// @dev v6 transparency mode — code committed, deployment deferred to
    ///      maintain v5 demo state.
    function publishAllBids() external onlyOwner {
        if (!announced) revert WinnerNotAnnounced();
        if (allBidsPublished) revert BidsAlreadyPublished();

        for (uint256 i = 0; i < bidders.length; i++) {
            BidData storage bid = bids[bidders[i]];
            FHE.makePubliclyDecryptable(bid.encPrice);
            FHE.makePubliclyDecryptable(bid.encYears);
            FHE.makePubliclyDecryptable(bid.encProjects);
            FHE.makePubliclyDecryptable(bid.encBond);
        }

        allBidsPublished = true;
        emit AllBidsPublished(block.timestamp);
    }

    /// @notice Permissionless once {publishAllBids} has been called. The caller
    ///         supplies a KMS-signed decryption proof for a single bidder's
    ///         encrypted price handle and the cleartext is committed on-chain.
    ///         The KMS attestation is the security gate -- supplying an
    ///         incorrect plaintext makes `FHE.checkSignatures` revert.
    /// @dev v6 transparency mode — code committed, deployment deferred to
    ///      maintain v5 demo state.
    function recordLoserBidPlaintext(
        address bidder,
        uint256 plaintextPrice,
        bytes calldata decryptionProof
    ) external {
        if (!allBidsPublished) revert BidsNotPublished();
        if (!hasBid[bidder]) revert UnknownBidder();

        bytes32[] memory handlesList = new bytes32[](1);
        handlesList[0] = FHE.toBytes32(bids[bidder].encPrice);

        bytes memory cleartexts = abi.encode(plaintextPrice);
        FHE.checkSignatures(handlesList, cleartexts, decryptionProof);

        plaintextLoserBids[bidder] = plaintextPrice;
        emit LoserBidPublished(bidder, plaintextPrice);
    }

    /// @notice Owner-set destination contract for winner propagation. Must implement
    ///         `setTenderWinner(uint256, address)` (e.g. PriceEscalation). Pass
    ///         `address(0)` to disable forwarding.
    function setWinnerSink(address _sink) external onlyOwner {
        winnerSink = _sink;
        emit WinnerSinkSet(_sink);
    }

    /// @notice Owner can adjust the reveal timeout within sane bounds. Reducing it
    ///         too aggressively risks racing the KMS roundtrip; raising it too high
    ///         defeats the liveness guarantee.
    function setRevealTimeout(uint256 _seconds) external onlyOwner {
        if (_seconds < 1 days || _seconds > 30 days) revert InvalidTimeout();
        revealTimeout = _seconds;
        emit RevealTimeoutSet(_seconds);
    }

    /// @notice Permissionless escape hatch: if the owner has called {requestReveal}
    ///         but failed to deliver the KMS-signed `revealWinner` proof within
    ///         `revealTimeout`, anyone may call this to mark the tender Cancelled
    ///         so bidders can recover their escrows via the BidEscrow refund path.
    /// @dev Removes single-point-of-liveness from the tender owner.
    function forceCancelStuckReveal() external {
        if (revealRequestedAt == 0) revert RevealNotRequested();
        if (revealed) revert AlreadyRevealed();
        if (block.timestamp < revealRequestedAt + revealTimeout) revert RevealTimeoutNotElapsed();
        state = TenderState.Cancelled;
        emit StuckRevealForceCancelled(msg.sender, block.timestamp - revealRequestedAt);
        emit TenderCancelled(block.timestamp);
    }

    // --- Views ---

    function getMyBid() external view returns (
        euint64 encPrice,
        euint32 encYears,
        euint32 encProjects,
        euint64 encBond,
        uint256 timestamp,
        uint256 version
    ) {
        BidData storage bid = bids[msg.sender];
        return (
            bid.encPrice,
            bid.encYears,
            bid.encProjects,
            bid.encBond,
            bid.timestamp,
            bid.version
        );
    }

    function getBidVersion(address bidder) external view returns (uint256) {
        return bids[bidder].version;
    }

    function getConfig() external view returns (TenderConfig memory) {
        return config;
    }

    function getSpec() external view returns (TenderSpecification memory) {
        return spec;
    }

    function getBidders(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory) {
        uint256 total = bidders.length;
        if (offset >= total) {
            return new address[](0);
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = bidders[offset + i];
        }
        return result;
    }

    // --- Admin ---

    function cancelTender() external onlyOwner {
        state = TenderState.Cancelled;
        emit TenderCancelled(block.timestamp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
