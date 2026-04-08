# SealTender: Uygulama Planı

## Sözleşme Mimarisi

```
ISealTender.sol          ← Shared enums, structs, events interface
IBidderRegistry.sol      ← Registry interface
│
├── core/
│   ├── TenderFactory.sol     ← Creates & tracks tenders (owner: municipality)
│   ├── EncryptedTender.sol   ← Single tender with FHE bids (Pausable)
│   └── BidEscrow.sol         ← ETH escrow (Ownable2Step, ReentrancyGuard)
│
├── identity/
│   └── BidderRegistry.sol    ← KYC whitelist + reputation (Ownable2Step)
│
├── modules/
│   ├── DisputeManager.sol    ← Complaints & slash (3 params: escrow, municipality, registry)
│   ├── PriceEscalation.sol   ← Oracle-based material price adjustment
│   └── CollisionDetector.sol ← FHE pairwise equality detection
│
└── token/
    └── MockUSDC.sol          ← Test ERC-20 token
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

**Role:** Tender deployment and tracking. Auto-authorizes new tenders in BidderRegistry.

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `(address _registry)` | — |
| createTender | `(TenderConfig calldata _config) → address` | onlyOwner |
| setDisputeManager | `(address _dm)` | onlyOwner |
| setEscalation | `(address _esc)` | onlyOwner |
| setCollisionDetector | `(address _cd)` | onlyOwner |
| getTenders | `(uint256 start, uint256 end) → address[]` | view |
| getTenderCount | `() → uint256` | view |
| tenderById | `(uint256) → address` | view |

### Events

- `TenderCreated(uint256 indexed tenderId, address tenderContract, string description)`
- `DisputeManagerSet(address indexed disputeManager)`
- `EscalationSet(address indexed escalation)`
- `CollisionDetectorSet(address indexed collisionDetector)`

### Validation

- `_config.deadline > block.timestamp`
- `_config.maxBidders > 0 && _config.maxBidders <= 10`

---

## EncryptedTender.sol

**Role:** Single tender instance. Manages FHE-encrypted bids, evaluation, and winner revelation.

### EncryptedBid Struct (Internal)

```solidity
struct EncryptedBid {
    bytes encPrice;
    bytes encYears;
    bytes encProjects;
    bytes encBond;
    uint256 version;
    bool exists;
}
```

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `(uint256 _tenderId, TenderConfig, address _registry, address _owner)` | — |
| submitBid | `(bytes encPrice, bytes encYears, bytes encProjects, bytes encBond)` | verified bidder |
| updateBid | `(bytes encPrice, bytes encYears, bytes encProjects, bytes encBond)` | existing bidder |
| startEvaluation | `()` | onlyOwner |
| submitScore | `(uint256 bidderIndex, uint256 score)` | onlyOwner |
| completeEvaluation | `()` | onlyOwner |
| revealWinner | `(uint256 winnerIndex, uint256 price)` | onlyOwner |
| cancel | `()` | onlyOwner |
| pause | `()` | onlyOwner |
| unpause | `()` | onlyOwner |
| getBidders | `(uint256 start, uint256 end) → address[]` | view |
| getBidderCount | `() → uint256` | view |
| getScore | `(uint256 index) → uint256` | view |

### State Transitions

```
Bidding → [startEvaluation] → Evaluating → [completeEvaluation] → Revealed → [revealWinner] → Completed
   ↓                              ↓                                    ↓
[cancel]                      [cancel]                             [cancel]
   ↓                              ↓                                    ↓
Cancelled                    Cancelled                            Cancelled
```

### Bid Submission Checks

1. `state == Bidding`
2. `block.timestamp < deadline`
3. `!bids[msg.sender].exists` (no duplicate)
4. `_bidders.length < maxBidders`
5. `registry.isVerified(msg.sender)`
6. `registry.getReputationScore(msg.sender) >= minReputation`

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
| fileCompanyComplaint | `(uint256 tenderId, address accused, string reason) payable → uint256` | anyone (0.01 ETH) |
| fileCitizenComplaint | `(uint256 tenderId, address accused, string reason) → uint256` | anyone |
| executeCourtOrder | `(uint256 tenderId, address accused, string reason, bool shouldFreeze) → uint256` | courtAuthority |
| resolveDispute | `(uint256 disputeId, DisputeStatus resolution)` | onlyOwner, nonReentrant |
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
```

### Constants

- `COMPLAINT_STAKE = 0.01 ether`

---

## PriceEscalation.sol

### Functions

| Function | Signature | Access |
|----------|-----------|--------|
| constructor | `()` | — |
| setEscalationRule | `(uint256 tenderId, bytes32 materialId, uint256 baselinePrice, uint256 thresholdPercent, uint256 capPercent, uint256 periodSeconds)` | onlyOwner |
| evaluateEscalation | `(uint256 tenderId, bytes32 materialId) → uint256 extraPayment` | onlyOwner |
| updateOraclePrice | `(bytes32 materialId, uint256 newPrice)` | onlyOwner |
| setTenderPrice | `(uint256 tenderId, uint256 price)` | onlyOwner |
| getBaselinePrice | `(uint256 tenderId, bytes32 materialId) → uint256` | view |
| getLatestPrice | `(bytes32 materialId) → uint256` | view |
| getTotalEscalation | `(uint256 tenderId) → uint256` | view |

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

## Test Özeti

**Toplam: 258 test**

| Modül | Test Sayısı |
|-------|-------------|
| TenderFactory | 28 |
| EncryptedTender | 52 |
| BidEscrow | 48 |
| BidderRegistry | 36 |
| DisputeManager | 38 |
| PriceEscalation | 26 |
| CollisionDetector | 14 |
| Integration (E2E) | 16 |

### Test Kategorileri

- Unit tests: Her fonksiyonun doğru çalışması
- Access control: Yetkisiz çağrıların revert etmesi
- State transitions: Geçersiz durum geçişlerinin revert etmesi
- Edge cases: Sınır değerler (0, max, overflow)
- Integration: Tam ihale akışı (create → bid → evaluate → reveal → dispute)
- FHE mock: Encrypted bid submission ve comparison simülasyonu

---

## Dağıtım Sırası

```
1. BidderRegistry (initialOwner = deployer)
2. TenderFactory (registry address)
3. BidEscrow ()
4. DisputeManager (escrow, municipality, registry)
5. PriceEscalation ()
6. CollisionDetector ()
7. MockUSDC ()

Post-deploy setup:
- factory.setDisputeManager(disputeManager)
- factory.setEscalation(escalation)
- factory.setCollisionDetector(collisionDetector)
- escrow.authorizeCaller(disputeManager)
- registry.addAuthorizedCaller(disputeManager)
```
