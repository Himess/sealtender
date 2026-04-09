# SealTender: Uygulama Planı

## Sözleşme Mimarisi

```
interfaces/
│   ├── ISealTender.sol          ← Shared enums (TenderState, DisputeType, etc.), structs, events
│   └── IBidderRegistry.sol      ← Registry interface (isVerified, getReputationScore, record*)
│
├── core/
│   ├── TenderFactory.sol     ← Creates & tracks tenders, 2 constructor args (registry, escrow)
│   ├── EncryptedTender.sol   ← FHE bids with on-chain evaluation (Ownable2Step, Pausable)
│   └── BidEscrow.sol         ← ETH escrow with freeze/slash (Ownable2Step, ReentrancyGuard)
│
├── identity/
│   └── BidderRegistry.sol    ← KYC whitelist + on-chain reputation (Ownable2Step)
│
├── modules/
│   ├── DisputeManager.sol    ← Complaints & slash, 3 constructor params (escrow, municipality, registry)
│   ├── PriceEscalation.sol   ← Chainlink AggregatorV3Interface + manual fallback + auto-payment
│   └── CollisionDetector.sol ← FHE pairwise equality detection (ZamaEthereumConfig)
│
├── token/
│   └── ConfidentialUSDC.sol  ← FHE-encrypted ERC7984 token with wrap/unwrap + faucet
│
└── test/
    ├── MockUSDC.sol          ← Standard ERC-20 test token (6 decimals)
    └── MockV3Aggregator.sol  ← Chainlink AggregatorV3Interface mock for testing
```

---

## ISealTender.sol — Shared Types

### Enums

```solidity
enum TenderState { Created, Bidding, Evaluating, Revealed, Completed, Cancelled }
enum DisputeType { Company, Citizen, CourtOrder }
enum DisputeStatus { Open, Investigating, Slashed, Frozen, Dismissed }
enum DepositStatus { None, Active, Frozen, Released, Refunded, Slashed }
```

### Structs

```solidity
struct TenderConfig {
    string description;
    uint256 deadline;
    uint32 weightYears;
    uint32 weightProjects;
    uint32 weightBond;
    uint32 minYears;
    uint32 minProjects;
    uint64 minBond;
    uint256 escrowAmount;
    uint256 maxBidders;
    uint256 minReputation;
}

struct Dispute {
    address complainant;
    address accused;
    uint256 tenderId;
    DisputeType disputeType;
    DisputeStatus status;
    uint256 stake;
    string reason;
}

struct EscalationRule {
    bytes32 materialId;
    uint256 baselinePrice;
    uint256 thresholdPercent;
    uint256 capPercent;
    uint256 periodSeconds;
    uint256 lastEvaluated;
}
```

---

## TenderFactory.sol

**Role:** Tender deployment and tracking. Inherits `Ownable2Step`. Auto-authorizes new tenders in BidderRegistry and sets required deposit in BidEscrow.

### Constructor

```solidity
constructor(address _registry, address _escrow)
```

Takes 2 parameters: registry and escrow addresses. Validates neither is zero.

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| createTender | `(TenderConfig calldata _config) → (uint256 tenderId, address tenderAddress)` | onlyOwner |
| setDisputeManager | `(address _dm)` | onlyOwner |
| setEscalation | `(address _esc)` | onlyOwner |
| setCollisionDetector | `(address _cd)` | onlyOwner |
| getTender | `(uint256 id) → address` | view |
| getTenderConfig | `(uint256 id) → TenderConfig` | view |
| getAllTenders | `() → address[]` | view |
| getTenders | `(uint256 offset, uint256 limit) → address[]` | view (paginated) |

### createTender Side Effects

1. Deploys a new `EncryptedTender` contract
2. Stores address in `tenders[tenderId]` and config in `tenderConfigs[tenderId]`
3. Calls `BidEscrow.setRequiredDeposit(tenderId, escrowAmount)` if escrow > 0
4. Calls `BidderRegistry.addAuthorizedCaller(tenderAddress)` so the tender can record bids/wins

### Events

- `TenderCreated(uint256 indexed tenderId, address tenderContract, string description)`
- `DisputeManagerSet(address indexed dm)`
- `EscalationSet(address indexed esc)`
- `CollisionDetectorSet(address indexed cd)`

### Validation

- `_config.deadline > block.timestamp`
- `_config.maxBidders > 0`

---

## EncryptedTender.sol

**Role:** Single tender instance. Manages FHE-encrypted bids with on-chain evaluation using real TFHE operations. Inherits `ZamaEthereumConfig`, `Ownable2Step`, `Pausable`.

### BidData Struct (Internal)

```solidity
struct BidData {
    euint64 encPrice;     // FHE-encrypted price
    euint32 encYears;     // FHE-encrypted experience years
    euint32 encProjects;  // FHE-encrypted completed projects
    euint64 encBond;      // FHE-encrypted bond capacity
    uint256 timestamp;    // Block timestamp of submission
    uint256 version;      // Update counter
}
```

**Note:** Bid data is stored as actual FHE types (`euint64`, `euint32`), not raw bytes. This enables on-chain FHE evaluation in `evaluateBatch()`.

### Constructor

```solidity
constructor(uint256 _tenderId, TenderConfig memory _config, address _registry, address _escrow)
```

Takes 4 parameters. Created by TenderFactory, which passes registry and escrow addresses.

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| submitBid | `(externalEuint64 price, bytes proof, externalEuint32 years, bytes proof, externalEuint32 projects, bytes proof, externalEuint64 bond, bytes proof)` | onlyVerified, beforeDeadline |
| evaluateBatch | `(uint256 startIdx, uint256 endIdx)` | onlyOwner, afterDeadline |
| requestReveal | `()` | onlyOwner (after evaluation complete) |
| revealWinner | `(uint256 winnerIdx, uint256 price, bytes decryptionProof)` | onlyOwner |
| cancelTender | `()` | onlyOwner |
| pause / unpause | `()` | onlyOwner |
| getMyBid | `() → (euint64, euint32, euint32, euint64, uint256, uint256)` | view (msg.sender only) |
| getBidVersion | `(address bidder) → uint256` | view |
| getConfig | `() → TenderConfig` | view |
| getBidders | `(uint256 offset, uint256 limit) → address[]` | view |

### On-Chain FHE Evaluation Flow

`evaluateBatch()` performs real FHE operations on-chain:

1. **Gate Check:** For each bidder, `FHE.ge()` compares encrypted qualifications against minimums
2. **Qualification:** `FHE.and()` combines gate results into a single `ebool qualified`
3. **Price Masking:** `FHE.select(qualified, encPrice, maxUint64)` masks unqualified bids
4. **Ranking:** `FHE.lt()` + `FHE.select()` track minimum price and winner index
5. **Batch Support:** Can evaluate in multiple batches via `startIdx`/`endIdx`

### State Transitions

```
Bidding → [evaluateBatch] → Evaluating → [evaluateBatch complete] → evaluationComplete=true
                                                 ↓
                                          [requestReveal] → FHE.makePubliclyDecryptable()
                                                 ↓
                                          [revealWinner] → Revealed (with KMS signature check)
   ↓
[cancelTender] → Cancelled (from any state)
```

### Bid Submission Flow

The `submitBid()` function handles both new bids and updates (if `hasBid[sender]` is true):

1. `state == Bidding` (inState modifier)
2. `block.timestamp < deadline` (beforeDeadline modifier)
3. `registry.isVerified(msg.sender)` (onlyVerified modifier)
4. `bidders.length < config.maxBidders` (MaxBiddersReached check)
5. `escrow.deposits(tenderId, msg.sender) >= config.escrowAmount` (EscrowRequired check)
6. `registry.getReputationScore(msg.sender) >= config.minReputation` (InsufficientReputation check)
7. `FHE.fromExternal()` validates and converts encrypted inputs
8. `FHE.allowThis()` + `FHE.allow(sender)` sets permissions
9. Records bid in registry via `registry.recordBid()`

---

## BidEscrow.sol

**Role:** Holds ETH escrow deposits. Supports freeze/slash for disputes.

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `()` | — |
| deposit | `(uint256 tenderId) payable` | anyone |
| release | `(uint256 tenderId, address bidder)` | authorized, nonReentrant |
| refund | `(uint256 tenderId, address bidder)` | authorized, nonReentrant |
| freeze | `(uint256 tenderId, address bidder)` | authorized |
| unfreeze | `(uint256 tenderId, address bidder)` | authorized |
| slash | `(uint256 tenderId, address bidder, address recipient)` | authorized, nonReentrant |
| setRequiredDeposit | `(uint256 tenderId, uint256 amount)` | authorized |
| authorizeCaller | `(address caller)` | onlyOwner |
| deauthorizeCaller | `(address caller)` | onlyOwner |
| getDeposit | `(uint256 tenderId, address bidder) → uint256` | view |
| getDepositStatus | `(uint256 tenderId, address bidder) → DepositStatus` | view |

### Deposit State Machine

```
None → [deposit] → Active → [release] → Released
                      ↓           
                  [freeze] → Frozen → [unfreeze] → Active
                      ↓           ↓
                  [refund]    [slash] → Slashed
                      ↓
                  Refunded
```

---

## BidderRegistry.sol

**Role:** KYC whitelist and on-chain reputation tracking.

### BidderProfile Struct

```solidity
struct BidderProfile {
    bool verified;
    uint256 totalBids;
    uint256 totalWins;
    uint256 totalSlashes;
    uint256 completedOnTime;
    uint256 registeredAt;
}
```

### Reputation Formula

```
score = (totalWins + completedOnTime) * 100 / (totalBids + totalSlashes * 2)
Default (new bidder): 50
Max: 100
```

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `(address initialOwner)` | — |
| registerBidder | `(address bidder)` | onlyOwner |
| removeBidder | `(address bidder)` | onlyOwner |
| addAuthorizedCaller | `(address caller)` | onlyOwnerOrAuthorized |
| removeAuthorizedCaller | `(address caller)` | onlyOwner |
| recordBid | `(address bidder)` | onlyAuthorized |
| recordWin | `(address bidder)` | onlyAuthorized |
| recordSlash | `(address bidder)` | onlyAuthorized |
| recordCompletion | `(address bidder)` | onlyAuthorized |
| isVerified | `(address bidder) → bool` | view |
| getProfile | `(address bidder) → BidderProfile` | view |
| getReputationScore | `(address bidder) → uint256` | view |
| bidderCount | `() → uint256` | view |

---

## DisputeManager.sol

**Constructor:** 3 parameters — `(address _escrow, address _municipality, address _registry)`

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `(address _escrow, address _municipality, address _registry)` | — |
| fileCompanyComplaint | `(uint256 tenderId, address accused, string reason) payable → uint256` | anyone (dynamic stake) |
| fileCitizenComplaint | `(uint256 tenderId, address accused, string reason) → uint256` | anyone |
| executeCourtOrder | `(uint256 tenderId, address accused, string reason, bool shouldFreeze) → uint256` | courtAuthority |
| resolveDispute | `(uint256 disputeId, DisputeStatus resolution)` | onlyOwner, nonReentrant |
| timeoutDispute | `(uint256 disputeId)` | anyone (after 30 days) |
| getComplaintStake | `(uint256 tenderId) → uint256` | view |
| setCourtAuthority | `(address _courtAuthority)` | onlyOwner |
| getDispute | `(uint256 disputeId) → Dispute` | view |
| getDisputesByTender | `(uint256 tenderId) → uint256[]` | view |

### Resolution Logic

```
Slashed:
  → escrow.slash(tenderId, accused, municipality)
  → registry.recordSlash(accused)  [if authorized]
  → Return stake to complainant

Dismissed:
  → Burn stake to municipality (StakeBurned event)
  → No action on accused

Timeout (after 30 days unresolved):
  → timeoutDispute(disputeId) callable by anyone
  → Return stake to complainant (prevents indefinite stake lock)
```

### Stake Model

- **Dynamic stake:** 5% of escrow amount, minimum 0.001 ETH (scales with tender size)
- **Query:** `getComplaintStake(tenderId)` returns the required stake for a given tender
- **Timeout:** `timeoutDispute(disputeId)` can be called by anyone after 30 days to reclaim stake if unresolved
- **Legacy constant:** `COMPLAINT_STAKE = 0.01 ether` retained as fallback floor reference

---

## PriceEscalation.sol

**Role:** Material price escalation with Chainlink AggregatorV3Interface integration and automatic payment to tender winners. Inherits `Ownable2Step`.

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `()` | — |
| setEscalationRule | `(uint256 tenderId, bytes32 materialId, uint256 baselinePrice, uint256 thresholdPercent, uint256 capPercent, uint256 periodSeconds)` | onlyOwner |
| evaluateEscalation | `(uint256 tenderId, bytes32 materialId) → uint256 extraPayment` | onlyOwner |
| updateOraclePrice | `(bytes32 materialId, uint256 newPrice)` | onlyOwner |
| setTenderPrice | `(uint256 tenderId, uint256 price)` | onlyOwner |
| **setPriceFeed** | `(bytes32 materialId, address feed)` | onlyOwner |
| **setTenderWinner** | `(uint256 tenderId, address winner)` | onlyOwner |
| **depositEscalationBudget** | `(uint256 tenderId) payable` | anyone |
| getBaselinePrice | `(uint256 tenderId, bytes32 materialId) → uint256` | view |
| getLatestPrice | `(bytes32 materialId) → uint256` | view |
| getTotalEscalation | `(uint256 tenderId) → uint256` | view |

### Chainlink Integration

```solidity
function getLatestPrice(bytes32 materialId) public view returns (uint256) {
    address feed = priceFeeds[materialId];
    if (feed != address(0)) {
        (, int256 price,, uint256 updatedAt,) = AggregatorV3Interface(feed).latestRoundData();
        require(price > 0, "Invalid oracle price");
        require(block.timestamp - updatedAt < 1 days, "Stale oracle data");
        return uint256(price);
    }
    return latestPrices[materialId]; // fallback to manual
}
```

### Auto-Payment Flow

`evaluateEscalation()` sonunda, eğer `tenderWinner[tenderId]` ve `escalationBudget[tenderId]` set edilmişse:

1. Winner adresine `extraPayment` kadar ETH otomatik gönderilir
2. `escalationBudget` azaltılır
3. Yetersiz bütçede `InsufficientEscalationBudget(tenderId, required, available)` revert

### Constants

- `MAX_PRICE_CHANGE_BPS = 5000` (50%)
- `BPS_DENOMINATOR = 10000`

### Escalation Formula

```
increaseBps = (currentPrice - baselinePrice) * 10000 / baselinePrice
extraPayment = tenderPrice * increaseBps / 10000
```

---

## CollisionDetector.sol

**Role:** FHE-based pairwise price equality detection.

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `()` | — |
| checkCollision | `(uint256 tenderId, inEuint64[] encPrices)` | onlyOwner |
| setCollisionResult | `(uint256 tenderId, bool result)` | onlyOwner |
| collisionChecked | `(uint256 tenderId) → bool` | view |
| collisionDetected | `(uint256 tenderId) → bool` | view |
| collisionHandle | `(uint256 tenderId) → bytes32` | view |

### FHE Operations

```solidity
// O(n^2) pairwise equality
for (i = 0; i < n; i++)
    for (j = i+1; j < n; j++)
        anyCollision = FHE.or(anyCollision, FHE.eq(prices[i], prices[j]))

FHE.makePubliclyDecryptable(anyCollision)
```

---

## ConfidentialUSDC.sol

**Role:** FHE-encrypted ERC7984 token backed by USDC. Inherits `ZamaEthereumConfig`, `ERC7984`, `Ownable2Step`.

### Constructor

```solidity
constructor(address initialOwner) ERC7984("Confidential USDC", "cUSDC", "") Ownable(initialOwner)
```

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| mint | `(address to, uint256 amount)` | onlyOwner |
| burn | `(address from, uint256 amount)` | onlyOwner |
| setUnderlyingUSDC | `(address _usdc)` | onlyOwner |
| wrap | `(uint256 amount)` | anyone (requires USDC approval) |
| unwrap | `(uint256 amount)` | anyone |
| faucet | `(uint256 amount)` | anyone (max 10,000 USDC, 1 hour cooldown) |

### Constants

- `FAUCET_MAX = 10_000 * 1e6` (10,000 USDC)
- `FAUCET_COOLDOWN = 1 hours`

### Wrap/Unwrap Flow

1. User approves ConfidentialUSDC to spend their USDC
2. `wrap(amount)`: transfers USDC from user, mints encrypted cUSDC
3. `unwrap(amount)`: burns encrypted cUSDC, transfers USDC back to user
4. If `underlyingUSDC` not set, wrap/unwrap revert with `WrapDisabled()`

---

## MockV3Aggregator.sol (Test Helper)

Chainlink AggregatorV3Interface mock for testing PriceEscalation. Provides `updateAnswer(int256)` and `setUpdatedAt(uint256)` for test scenarios.

---

## Test Ozeti

**Toplam: 367 test**

| Modul | Test Sayisi |
|-------|-------------|
| BidEscrow | 62 |
| BidderRegistry | 32 |
| EncryptedTender | 35 |
| TenderFactory | 28 |
| DisputeManager | 31 |
| PriceEscalation | 27 |
| CollisionDetector | 13 |
| ConfidentialUSDC | 26 |
| EdgeCases | 78 |
| GasBenchmark | 16 |
| Integration (E2E) | 19 |

### Test Kategorileri

- Unit tests: Her fonksiyonun doğru çalışması
- Access control: Yetkisiz çağrıların revert etmesi
- State transitions: Geçersiz durum geçişlerinin revert etmesi
- Edge cases: Sınır değerler (0, max, overflow)
- Integration: Tam ihale akışı (create → bid → evaluate → reveal → dispute)
- FHE mock: Encrypted bid submission ve comparison simülasyonu

---

## Dagitim Sirasi

```
1. BidderRegistry (initialOwner = deployer)
2. BidEscrow ()
3. ConfidentialUSDC (initialOwner = deployer)
4. TenderFactory (registry.address, escrow.address)
5. DisputeManager (escrow.address, deployer, registry.address)
6. PriceEscalation ()
7. CollisionDetector ()

Post-deploy setup:
- escrow.authorizeCaller(factory.address)        — Factory can set required deposits
- registry.addAuthorizedCaller(factory.address)   — Factory can authorize new tenders
- registry.addAuthorizedCaller(disputeManager.address) — DM can record slashes
- escrow.authorizeCaller(disputeManager.address)  — DM can slash escrow (CRITICAL)
- factory.setDisputeManager(disputeManager.address)
- factory.setEscalation(escalation.address)
- factory.setCollisionDetector(collisionDetector.address)
```

**Not:** Factory'nin escrow'da authorize edilmesi zorunludur, aksi halde `createTender()` icindeki `setRequiredDeposit()` cagrisi revert eder.
