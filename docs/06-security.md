# SealTender: Security Analysis

## 1. Trust Model

### 1.1 Actors

| Actor | Role | Trust Level |
|-------|------|-------------|
| Municipality (Owner) | Creates tenders, manages evaluation | Partially trusted (admin) |
| Bidders | Submit encrypted bids | Untrusted |
| Court Authority | Issues court orders | Trusted (legal system) |
| Citizens | File complaints | Untrusted |
| Zama KMS | Manages FHE keys | Trusted (infrastructure) |
| Zama Gateway | Relays decryption requests | Trusted (replaceable) |
| Ethereum Validators | Consensus | Majority honest assumption |

### 1.2 Security Properties

| Property | Guarantee | Mechanism |
|----------|-----------|-----------|
| Bid confidentiality | Strong | FHE encryption (TFHE scheme) |
| Evaluation integrity | Strong | Deterministic on-chain computation |
| Access control | Strong | Solidity modifiers + Ownable2Step |
| Reentrancy protection | Strong | ReentrancyGuard on all ETH transfers |
| Frontrunning resistance | Moderate | Encrypted bids (MEV sees ciphertext only) |
| Sybil resistance | Weak | Mock KYC whitelist (hackathon) |
| Liveness | Moderate | Owner-dependent state transitions |
| Censorship resistance | Strong | Ethereum L1 |

---

## 2. Attack Vectors

### Attack 1: Bid Content Extraction

**Threat:** An attacker attempts to decrypt encrypted bid data.

**Analysis:**
- FHE ciphertexts are stored as `bytes` in contract storage
- Decryption requires the FHE secret key, held by Zama's KMS
- No party (including the contract owner or validators) can access plaintext
- `FHE.makePubliclyDecryptable()` is only called on the collision detection result (boolean), not on bid data

**Residual Risk:** KMS compromise would expose all encrypted data. Mitigation: threshold decryption (future).

**Severity:** Critical if exploited, but requires compromising Zama's infrastructure.

**Status:** Accepted risk (inherent to current fhEVM architecture).

---

### Attack 2: Malicious Owner (Municipality)

**Threat:** The contract owner manipulates the tender outcome.

**Analysis:**

The owner CAN:
- Create tenders with biased weights (but weights are public and auditable)
- Cancel tenders at any time
- Pause/unpause individual tenders
- Register or remove bidders from the whitelist
- Control the evaluation flow timing

The owner CANNOT:
- Read encrypted bids (FHE protection)
- Alter the evaluation algorithm (hardcoded in contract)
- Change weights after tender creation (immutable in TenderConfig)
- Submit bids on their own behalf (would need to be in whitelist)
- Modify scores after submission (sequential ordering enforced)

**Residual Risk:** Owner can delay or refuse to complete evaluation. Owner can set extreme weights favoring specific firms.

**Mitigation:** Multi-sig ownership, timelock, DAO governance (planned).

---

### Attack 3: Sybil Attack (Multiple Fake Bidders)

**Threat:** An attacker registers multiple fake identities to manipulate bidding.

**Analysis:**
- BidderRegistry requires `registerBidder()` by owner (whitelist)
- Each address can only bid once per tender
- Escrow deposit required per bid (financial cost)

**Residual Risk:** Mock KYC does not prevent owner from registering fake accounts.

**Mitigation:** Real KYC integration (WorldID, Polygon ID) in production.

**Severity:** High in current implementation, Low with proper KYC.

---

### Attack 4: Frontrunning / MEV

**Threat:** MEV searchers or validators observe pending transactions and extract bid information.

**Analysis:**
- `submitBid()` transactions contain only FHE ciphertexts
- Ciphertexts reveal no information about plaintext values
- MEV searchers see: sender address, contract address, gas, and ciphertext bytes
- No meaningful frontrunning is possible on encrypted data

**Residual Risk:** Transaction ordering could theoretically affect tiebreaking (first-submitter rule), but MEV bots cannot determine bid prices to decide whether to front-run.

**Severity:** Negligible.

---

### Attack 5: Reentrancy in Escrow

**Threat:** Malicious contract exploits reentrancy during ETH transfers.

**Analysis:**
- `BidEscrow` uses `ReentrancyGuard` on all external ETH transfer functions
- `release()`, `refund()`, and `slash()` all have `nonReentrant` modifier
- State updates happen before external calls (CEI pattern)
- `Ownable2Step` prevents accidental ownership transfer

**Code pattern:**
```solidity
function release(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant {
    _requireActive(tenderId, bidder);           // Check
    depositStatus[tenderId][bidder] = Released;  // Effect (state update)
    deposits[tenderId][bidder] = 0;              // Effect
    (bool success, ) = payable(bidder).call{value: amount}(""); // Interaction
}
```

**Severity:** Mitigated.

---

### Attack 6: Griefing via Dispute Spam

**Threat:** An attacker files many frivolous disputes to harass bidders.

**Analysis:**
- Company complaints require 0.01 ETH stake
- Dismissed complaints burn the stake to municipality
- This creates economic cost for spam

**Residual Risk:**
- Citizen complaints are free (no stake) — potential for spam
- A wealthy attacker could afford to lose 0.01 ETH repeatedly
- Frozen escrow during investigation period harms innocent parties

**Mitigation:**
- Rate limiting on citizen complaints (not implemented)
- Higher stake for repeat complainants (not implemented)
- Reputation-based complaint filtering (future)

**Severity:** Moderate for citizen complaints, Low for company complaints.

---

### Attack 7: Oracle Manipulation (Price Escalation)

**Threat:** The oracle price feed is manipulated to trigger unjust escalation.

**Analysis:**
- `updateOraclePrice()` is currently owner-controlled (hackathon scope)
- `MAX_PRICE_CHANGE_BPS = 5000` (50%) limits single-update manipulation
- But the owner could make multiple small updates to reach extreme values

**Mitigation:**
- Chainlink/Pyth integration with TWAP (production)
- Multi-oracle consensus
- Escalation cap per tender (`capPercent`)

**Severity:** High in current implementation, Low with proper oracle.

---

### Attack 8: Bid Replay / Replay Attack

**Threat:** An attacker copies another bidder's encrypted bytes and submits them.

**Analysis:**
- FHE ciphertexts are bound to the sender's address via `createEncryptedInput(contractAddress, senderAddress)`
- Reusing ciphertext from a different sender will fail validation
- Each encryption is unique even for identical plaintext values (random nonce)

**Severity:** Not applicable (prevented by fhEVM design).

---

### Attack 9: Deadline Manipulation

**Threat:** The owner sets an extremely short deadline or changes the deadline to favor a bidder who already submitted.

**Analysis:**
- Deadline is set at tender creation and stored in immutable `TenderConfig`
- Cannot be modified after creation (no setter function)
- `config.deadline > block.timestamp` validated at creation

**Residual Risk:** Owner can create a tender with a deadline 1 second in the future, then immediately start evaluation. But no one would have time to bid, making the tender pointless.

**Severity:** Low (self-defeating attack).

---

## 3. Information Leakage Analysis

### 3.1 What is Observable On-Chain

| Data Point | Visible To | Sensitivity |
|------------|-----------|-------------|
| Tender description | Everyone | Public (intended) |
| Tender deadline | Everyone | Public (intended) |
| Evaluation weights | Everyone | Public (legal requirement) |
| Number of bidders | Everyone | Low |
| Bidder addresses | Everyone | Medium |
| Bid timestamps | Everyone | Low |
| Bid update count (version) | Everyone | Low |
| Encrypted bid bytes | Everyone | None (ciphertext) |
| Winner address | Everyone | Public (intended) |
| Winning price | Everyone | Public (intended) |
| Dispute filings | Everyone | Public (intended) |
| Escrow amounts | Everyone | Low |

### 3.2 Metadata Leakage

An adversary can infer:
- **Firm interest:** Which addresses bid on which tenders
- **Bid timing patterns:** When firms typically bid (early vs last-minute)
- **Update frequency:** How many times a firm revises their bid
- **Financial capacity:** Escrow deposit amount (if different from required)

These metadata leaks are equivalent to what is visible in traditional sealed-bid systems (envelope submission logs).

---

## 4. Residual Risks Summary

| Risk | Severity | Likelihood | Mitigation Status |
|------|----------|------------|-------------------|
| KMS compromise | Critical | Very Low | Accepted (fhEVM inherent) |
| Malicious owner | High | Medium | Partial (multi-sig planned) |
| Sybil attack | High | Medium | Partial (real KYC planned) |
| Oracle manipulation | High | Medium | Partial (Chainlink planned) |
| Citizen complaint spam | Medium | Medium | Not mitigated |
| Bid metadata leakage | Low | Certain | Accepted (equivalent to traditional) |
| Deadline gaming | Low | Low | Mitigated (immutable config) |
| Frontrunning | Negligible | Low | Mitigated (FHE) |
| Reentrancy | Negligible | Very Low | Mitigated (ReentrancyGuard) |
| Replay attack | None | None | Mitigated (fhEVM design) |

---

## 5. Additional Attack Vectors

### Attack 10: KMS Collusion (Threshold Decryption)

**Threat:** If Zama's KMS operators collude, they could decrypt all encrypted bid data.

**Analysis:**
- Current architecture relies on Zama's centralized KMS for key management
- KMS uses a 9-of-13 threshold scheme internally (per Zama documentation)
- Compromising 9 of 13 key holders would expose all FHE ciphertexts
- This includes all bid prices, qualifications, and bond capacities

**Residual Risk:** Critical dependency on Zama's operational security. No protocol-level mitigation exists in the current architecture.

**Mitigation (Roadmap):** On-chain threshold decryption with community-operated key holders, eliminating single-vendor dependency.

**Severity:** Critical if exploited, but requires compromising Zama's internal infrastructure.

---

### Attack 11: Flash Loan Attack

**Threat:** An attacker uses a flash loan to temporarily meet escrow requirements.

**Analysis:**
- `BidEscrow.deposit()` accepts ETH via `msg.value` — no flash loan vector (ETH cannot be flash-borrowed in the same way as ERC-20)
- Even if escrow were token-based, the deposit is held across transactions (not atomic)
- Flash loans are single-transaction — the deposit would be locked before the loan expires

**Severity:** Not applicable (ETH escrow model prevents flash loan attacks).

---

### Attack 12: Smart Contract Upgrade Attack

**Threat:** An attacker exploits an upgrade mechanism to replace contract logic.

**Analysis:**
- SealTender contracts are NOT upgradeable — no proxy pattern, no DELEGATECALL
- Each tender is a separate contract deployed by the factory
- Factory address is stored in registry and escrow but cannot replace existing tenders
- `Ownable2Step` prevents accidental ownership transfer

**Severity:** Not applicable (non-upgradeable architecture by design).

---

## 6. Comparison Matrix: Security Properties

| Property | SealTender | Commit-Reveal | MPC | TEE |
|----------|-----------|---------------|-----|-----|
| Bid privacy (evaluation) | FHE | None | Yes | Hardware-dependent |
| Bid privacy (post-reveal) | Losers hidden | All exposed | Configurable | Hardware-dependent |
| Computation integrity | On-chain | None | Off-chain | Enclave |
| MEV resistance | Strong | Weak (reveal tx) | N/A | N/A |
| Trusted hardware | None | None | None | Required |
| Side-channel resistance | Immune | N/A | N/A | Vulnerable |
| Setup requirements | None | None | Key ceremony | Attestation |
| Liveness dependency | Owner | All parties | n-of-m | Hardware vendor |
| Auditability | Full on-chain | Full on-chain | Partial | Attestation logs |
| Gas cost | High (~23M) | Low (~100K) | Off-chain | Off-chain |
| KMS dependency | Zama (centralized) | None | Distributed | Hardware vendor |
| Upgrade risk | None (immutable) | None | Protocol-dependent | Firmware updates |

---

## 7. Mitigation Strategy Summary

| Risk | Current Status | Short-term | Long-term |
|------|---------------|------------|-----------|
| KMS compromise | Accepted | Monitor Zama security bulletins | Threshold decryption |
| Malicious owner | Mitigated | `forceCancelStuckReveal` 7-day timeout + multi-sig recommended | DAO + timelock controller |
| Sybil attack | Weak | Rate limiting + higher escrow | WorldID + Polygon ID |
| Oracle manipulation | Improved (Chainlink+Pyth, stale-round check) | Multi-oracle consensus | TWAP + median oracle |
| Citizen complaint spam | Mitigated (0.0005 ETH stake) | Per-address rate limit | Reputation-gated complaints |
| Gas cost DoS | Bounded (max 50, 10/batch) | Batch evaluation | L2 FHE deployment |

---

## 8. Internal Audit Pass (April 2026)

A full audit pass was performed against the v1 codebase prior to Sepolia redeploy. Three Critical, two High, four Medium, and five Low findings were identified and fixed in-place. This section documents each issue, its impact, and the patch.

### 8.1 Critical — Patched

#### C-1 — `ConfidentialUSDC.unwrap` fund drain

**File:** `contracts/token/ConfidentialUSDC.sol`

The legacy `unwrap(amount)` called `_burn(msg.sender, encAmount)` (which silently caps at the caller balance per `FHESafeMath.tryDecrease`) and then immediately transferred `amount` of plaintext underlying USDC. A caller with a 0 cUSDC balance could pass a positive `amount` to drain the underlying USDC reserves of legitimate wrappers — the `_burn` would no-op (transferred = 0), but the plaintext transfer would proceed.

**Fix:** Replaced the entire ConfidentialUSDC with a subclass of OpenZeppelin's `ERC7984ERC20Wrapper` (the canonical Zama wrap/unwrap pattern). Unwrap is now a 2-step KMS-mediated flow: `unwrap(from, to, amount)` queues a request keyed by the burnt-amount handle; `finalizeUnwrap(requestId, cleartextAmount, kmsProof)` releases `cleartextAmount * rate()` underlying USDC only after `FHE.checkSignatures` verifies the threshold-signed decryption proof binds the cleartext to the queued ciphertext.

#### C-2 — Faucet enabled unbacked cUSDC supply

**File:** `contracts/token/ConfidentialUSDC.sol`

The legacy `faucet(amount)` minted up to 10,000 cUSDC per hour with no underlying USDC backing. Combined with the (now-fixed) C-1 drain, faucet recipients could `unwrap` their unbacked cUSDC against the real USDC reserves of legitimate wrappers — wholesale theft.

**Fix:** Faucet removed entirely. Test users on Sepolia acquire test USDC from Circle's official faucet at https://faucet.circle.com (chain: Ethereum Sepolia, USDC token: `0x1c7D…7238`). cUSDC supply is now provably 1:1 backed by underlying USDC.

#### C-3 — `CollisionDetector.setCollisionResult` decryption proof bypass

**File:** `contracts/modules/CollisionDetector.sol`

The legacy `setCollisionResult(tenderId, bool result)` allowed the owner to write any boolean directly into `collisionDetected[tenderId]` without verifying the cleartext matched the actual decryption of the FHE-computed `anyCollision` ciphertext. The owner could fabricate a "no collision" verdict to validate a tender that contained colluding bidders, or fabricate a "collision detected" verdict to invalidate a legitimate tender.

**Fix:** Added the canonical Zama public-decryption verification. The `result` parameter is now bound to the stored handle through the KMS-signed proof; mismatching values revert.

```solidity
function setCollisionResult(uint256 tenderId, bool result, bytes calldata decryptionProof) external onlyOwner {
    bytes32[] memory handlesList = new bytes32[](1);
    handlesList[0] = collisionHandle[tenderId];
    bytes memory cleartexts = abi.encode(result);
    FHE.checkSignatures(handlesList, cleartexts, decryptionProof);
    collisionDetected[tenderId] = result;
}
```

### 8.2 High — Patched

#### H-1 — `evaluateBatch` cross-batch ACL bug

**File:** `contracts/core/EncryptedTender.sol`

The legacy `evaluateBatch` produced fresh `currentMinPrice` and `currentWinnerIdx` ciphertexts via `FHE.select`, stored them in contract storage, but never called `FHE.allowThis` on the new handles. When the next batch ran in a subsequent transaction, the FHE coprocessor's ACL check rejected the contract read of those stored ciphertexts — silently failing on the mock and outright reverting on the real fhEVM. With `MAX_BATCH_SIZE = 5` and `maxBidders <= 10`, this meant the effective bidder cap was actually 5, not the 10 advertised.

**Fix:** Added `FHE.allowThis(currentMinPrice)` and `FHE.allowThis(currentWinnerIdx)` at the end of each batch. The cap was raised: `MAX_BIDDERS = 50`, `MAX_BATCH_SIZE = 10`, providing 5 batches headroom to reach the new cap.

#### H-2 — `BidderRegistry.addAuthorizedCaller` privilege escalation

**File:** `contracts/identity/BidderRegistry.sol`

The legacy `addAuthorizedCaller` was gated by `onlyOwnerOrAuthorized` — meaning any authorized contract (e.g. a tender contract) could authorize further callers. A single compromised tender could contaminate the entire registry reputation surface by registering attacker-controlled contracts as authorized.

**Fix:** Replaced with a dedicated `tenderManager` role (typically the TenderFactory). Only `owner` or `tenderManager` may call `addAuthorizedCaller`; authorized contracts cannot escalate. Setter `setTenderManager` is `onlyOwner`.

### 8.3 Medium — Patched

| ID | File | Issue | Patch |
|---|---|---|---|
| M-1 | `PriceEscalation.sol` | Pyth `expo` field ignored, mixing scales between Chainlink and Pyth | Added `_scaleTo1e8` helper; Pyth path now applies signed `expo` correctly |
| M-2 | `PriceEscalation.sol` | Chainlink stale-round check missing | Added `require(answeredInRound >= roundId)` and `decimals()` rescaling |
| M-3 | `EncryptedTender.sol` + `TenderFactory.sol` | `PriceEscalation.tenderWinner` had to be wired manually | EncryptedTender constructor now accepts a `winnerSink`; `revealWinner` auto-forwards via low-level call to `setTenderWinner(uint256, address)` |
| M-4 | `EncryptedTender.sol` | Owner could stall reveal indefinitely, freezing escrow | Added `forceCancelStuckReveal` (permissionless) callable after `revealTimeout` (default 7d, range 1–30d) |

### 8.4 Low — Patched

| ID | File | Issue | Patch |
|---|---|---|---|
| L-1 | `PriceEscalation.sol` | `totalEscalationPaid` incremented before payment landed (inconsistent if winner=0) | Counter advances only after payment lands |
| L-2 | `TenderFactory.sol` | `disputeManager`, `escalation`, `collisionDetector` settable but unused | Documented as off-chain references for frontend; `escalation` is now actively used as the tender `winnerSink` (see M-3) |
| L-3 | `DisputeManager.sol` | `fileCitizenComplaint` was free → spam vector against the resolution capacity | Added `CITIZEN_STAKE = 0.0005 ETH`; refunded on Slashed/Frozen, burned to municipality on Dismissed |
| L-4 | `BidderRegistry.sol` | Slashed bidders permanently banned (denominator only grows) | Documented as intentional — slashing is a strong signal; recovery would require new identity |
| L-5 | `BidEscrow.sol` | `deposit` accepted any tenderId (including unconfigured ones), locking funds | Added `TenderNotConfigured` revert when `requiredDeposit[tenderId] == 0` |

### 8.5 Defensive additions (no prior issue)

- `EncryptedTender.submitBid` **`nonReentrant`** added. The function makes external view calls to `escrow.deposits` and `registry.getReputationScore` and an external state-mutating call to `registry.recordBid`; while CEI was already followed and these targets are protocol-controlled, the guard is a zero-cost defense against misconfiguration.
- `ConfidentialUSDC` **pause hooks at canonical override sites**: `wrap` (public), `_unwrap` (internal — covers both public unwrap entries via single chokepoint), and `onTransferReceived` (ERC-1363 entry). `finalizeUnwrap` is intentionally NOT pausable — once `_unwrap` has burnt the encrypted balance, blocking finalize would freeze the underlying USDC indefinitely.

### 8.6 Test coverage after patches

- **294 unit tests passing** in the in-process FHEVM mock
- **5 KMS-signed integration tests** marked `it.skip` in mock — exercised on Zama testnet via `npm run test:fhevm-testnet` (the in-process mock cannot synthesize threshold signatures)
- **0 failing tests**

### 8.7 Sepolia redeploy (post-fix, April 2026)

| Contract | Address | Verification |
|---|---|---|
| BidderRegistry | `0x2E8037626102ca3393ab9EfE7a3A254b30B236CA` | Sourcify ✅ |
| BidEscrow | `0x1635eb515c80eEf52CD88d34109C83D8b5321647` | Sourcify ✅ |
| ConfidentialUSDC | `0xCe493fFaBf3763df8057E58c22a6dC6a65806553` | Sourcify ✅ |
| PriceEscalation | `0x75ea85aaB4d130cFE2Bf0C7121a6535Fc3a1fa9a` | Sourcify ✅ |
| CollisionDetector | `0x3e8c0eDC536bce66ba8ef161eC40E7fA39d38Aee` | Sourcify ✅ |
| TenderFactory | `0x5e2A776D44D63200285fAc230922aFd45A2EEb5C` | Sourcify ✅ |
| DisputeManager | `0x2424AE8B6d41F813bca1Bf669f23f355fDb5979B` | Sourcify ✅ |

External integrations bound at deploy time:
- Underlying USDC (Circle, Sepolia): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` — immutable per OZ `ERC7984ERC20Wrapper`
- Pyth Network (PriceEscalation): `0xDd24F84d36BF92C65F92307595335bdFab5Bbd21`
