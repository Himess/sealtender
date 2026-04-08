# SealTender: Complete API Reference

## 1. ISealTender.sol — Shared Types

### Enums

```solidity
enum TenderState   { Created, Bidding, Evaluating, Revealed, Completed, Cancelled }
enum DisputeType   { Company, Citizen, CourtOrder }
enum DisputeStatus { Open, Investigating, Slashed, Frozen, Dismissed }
enum DepositStatus { None, Active, Frozen, Released, Refunded, Slashed }
```

### Structs

```solidity
struct TenderConfig {
    string description;        // Human-readable procurement description
    uint256 deadline;          // Unix timestamp for bid submission cutoff
    uint32 weightYears;        // Weight for experience (bps)
    uint32 weightProjects;     // Weight for completed projects (bps)
    uint32 weightBond;         // Weight for bond capacity (bps)
    uint32 minYears;           // Minimum years of experience
    uint32 minProjects;        // Minimum completed projects
    uint64 minBond;            // Minimum bond capacity
    uint256 escrowAmount;      // Required escrow deposit (wei)
    uint256 maxBidders;        // Max bidders (1-10)
    uint256 minReputation;     // Minimum reputation score (0-100)
}

struct Dispute {
    address complainant;       // Who filed
    address accused;           // Who is accused
    uint256 tenderId;          // Associated tender
    DisputeType disputeType;   // Company, Citizen, or CourtOrder
    DisputeStatus status;      // Current status
    uint256 stake;             // Staked ETH (Company only)
    string reason;             // Human-readable reason
}

struct EscalationRule {
    bytes32 materialId;        // Material identifier
    uint256 baselinePrice;     // Price at contract time
    uint256 thresholdPercent;  // Trigger threshold (bps)
    uint256 capPercent;        // Max escalation (bps)
    uint256 periodSeconds;     // Min time between evals
    uint256 lastEvaluated;     // Last evaluation timestamp
}
```

---

## 2. TenderFactory

**Inheritance:** `Ownable`  
**Constructor:** `(address _registry)`

### Write Functions

#### createTender

```solidity
function createTender(TenderConfig calldata _config) external onlyOwner returns (address)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| _config | TenderConfig | Full tender configuration |
| **Returns** | address | Deployed EncryptedTender contract address |

**Reverts:**
- `InvalidConfig()` — deadline in the past
- `InvalidConfig()` — maxBidders == 0 or > 10

**Events:** `TenderCreated(uint256 indexed tenderId, address tenderContract, string description)`

**Side Effects:** Calls `registry.addAuthorizedCaller(tenderAddr)` automatically.

#### setDisputeManager

```solidity
function setDisputeManager(address _dm) external onlyOwner
```

**Events:** `DisputeManagerSet(address indexed disputeManager)`

#### setEscalation

```solidity
function setEscalation(address _esc) external onlyOwner
```

**Events:** `EscalationSet(address indexed escalation)`

#### setCollisionDetector

```solidity
function setCollisionDetector(address _cd) external onlyOwner
```

**Events:** `CollisionDetectorSet(address indexed collisionDetector)`

### Read Functions

#### getTenders

```solidity
function getTenders(uint256 start, uint256 end) external view returns (address[] memory)
```

**Reverts:**
- `InvalidRange()` — start >= end
- `EndExceedsTenders()` — end > total count

#### getTenderCount

```solidity
function getTenderCount() external view returns (uint256)
```

#### tenderById

```solidity
function tenderById(uint256 tenderId) external view returns (address)
```

---

## 3. EncryptedTender

**Inheritance:** `Ownable`, `Pausable`  
**Constructor:** `(uint256 _tenderId, TenderConfig memory _config, address _registry, address _owner)`

### Write Functions

#### submitBid

```solidity
function submitBid(
    bytes calldata encPrice,
    bytes calldata encYears,
    bytes calldata encProjects,
    bytes calldata encBond
) external whenNotPaused
```

**Checks (in order):**
1. `state == Bidding` → `NotBidding()`
2. `block.timestamp < deadline` → `DeadlinePassed()`
3. `!bids[msg.sender].exists` → `AlreadyBid()`
4. `_bidders.length < maxBidders` → `TenderFull()`
5. `registry.isVerified(msg.sender)` → `NotVerified()`
6. `registry.getReputationScore(msg.sender) >= minReputation` → `InsufficientReputation()`

**Events:** `BidSubmitted(address indexed bidder)`

#### updateBid

```solidity
function updateBid(
    bytes calldata encPrice,
    bytes calldata encYears,
    bytes calldata encProjects,
    bytes calldata encBond
) external whenNotPaused
```

**Checks:**
1. `state == Bidding` → `NotBidding()`
2. `block.timestamp < deadline` → `DeadlinePassed()`
3. `bids[msg.sender].exists` → `NotBidding()`

**Events:** `BidUpdated(address indexed bidder, uint256 version)`

#### startEvaluation

```solidity
function startEvaluation() external onlyOwner
```

**Checks:**
1. `state == Bidding` → `NotBidding()`
2. `block.timestamp >= deadline` → `DeadlineNotPassed()`
3. `_bidders.length > 0` → `NoBids()`

**State Change:** `Bidding → Evaluating`  
**Events:** `EvaluationStarted()`

#### submitScore

```solidity
function submitScore(uint256 bidderIndex, uint256 score) external onlyOwner
```

**Checks:**
1. `state == Evaluating` → `NotEvaluating()`
2. `bidderIndex == evaluatedCount` → `MustEvaluateInOrder()`
3. `bidderIndex < _bidders.length` → `InvalidRange()`

#### completeEvaluation

```solidity
function completeEvaluation() external onlyOwner
```

**Checks:**
1. `state == Evaluating` → `NotEvaluating()`
2. `evaluatedCount == _bidders.length` → `InvalidRange()`

**State Change:** `Evaluating → Revealed`  
**Events:** `EvaluationCompleted()`

#### revealWinner

```solidity
function revealWinner(uint256 winnerIndex, uint256 price) external onlyOwner
```

**Checks:**
1. `state == Revealed` → `NotRevealed()`
2. `winnerIndex < _bidders.length` → `InvalidRange()`

**State Change:** `Revealed → Completed`  
**Events:** `WinnerRevealed(address winner, uint256 price)`

#### cancel

```solidity
function cancel() external onlyOwner
```

**State Change:** `Any → Cancelled`  
**Events:** `TenderCancelled()`

#### pause / unpause

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

### Read Functions

#### config

```solidity
function config() external view returns (
    string description, uint256 deadline, uint32 weightYears,
    uint32 weightProjects, uint32 weightBond, uint32 minYears,
    uint32 minProjects, uint64 minBond, uint256 escrowAmount,
    uint256 maxBidders, uint256 minReputation
)
```

#### bids

```solidity
function bids(address bidder) external view returns (
    bytes encPrice, bytes encYears, bytes encProjects,
    bytes encBond, uint256 version, bool exists
)
```

#### getBidders

```solidity
function getBidders(uint256 start, uint256 end) external view returns (address[] memory)
```

**Reverts:** `InvalidRange()`, `EndExceedsBidders()`

#### Other Views

```solidity
function tenderId() external view returns (uint256)
function state() external view returns (TenderState)
function winner() external view returns (address)
function winnerPrice() external view returns (uint256)
function evaluatedCount() external view returns (uint256)
function getBidderCount() external view returns (uint256)
function getScore(uint256 index) external view returns (uint256)
```

---

## 4. BidEscrow

**Inheritance:** `Ownable2Step`, `ReentrancyGuard`  
**Constructor:** `()`

### Write Functions

#### deposit

```solidity
function deposit(uint256 tenderId) external payable
```

**Reverts:**
- `DepositAlreadyExists()` — status != None
- `InsufficientDeposit()` — msg.value < required

**Events:** `EscrowDeposited(uint256 indexed tenderId, address indexed bidder, uint256 amount)`

#### release

```solidity
function release(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant
```

**Reverts:** `DepositNotActive()`, `DepositFrozen()`, `NoDeposit()`, `TransferFailed()`  
**State Change:** `Active → Released`  
**Events:** `EscrowReleased(uint256 indexed tenderId, address indexed bidder, uint256 amount)`

#### refund

```solidity
function refund(uint256 tenderId, address bidder) external onlyAuthorized nonReentrant
```

**Reverts:** `DepositNotActive()`, `DepositFrozen()`, `NoDeposit()`, `TransferFailed()`  
**State Change:** `Active → Refunded`  
**Events:** `EscrowRefunded(uint256 indexed tenderId, address indexed bidder, uint256 amount)`

#### freeze

```solidity
function freeze(uint256 tenderId, address bidder) external onlyAuthorized
```

**State Change:** `Active → Frozen`  
**Events:** `EscrowFrozen(uint256 indexed tenderId, address indexed bidder)`

#### unfreeze

```solidity
function unfreeze(uint256 tenderId, address bidder) external onlyAuthorized
```

**State Change:** `Frozen → Active`  
**Events:** `EscrowUnfrozen(uint256 indexed tenderId, address indexed bidder)`

#### slash

```solidity
function slash(uint256 tenderId, address bidder, address recipient) external onlyAuthorized nonReentrant
```

**Accepts:** Active or Frozen deposits  
**Reverts:** `DepositNotActive()`, `ZeroAddress()`, `NoDeposit()`, `TransferFailed()`  
**State Change:** `Active|Frozen → Slashed`  
**Events:** `EscrowSlashed(uint256 indexed tenderId, address indexed bidder, address recipient, uint256 amount)`

#### setRequiredDeposit

```solidity
function setRequiredDeposit(uint256 tenderId, uint256 amount) external onlyAuthorized
```

**Events:** `RequiredDepositSet(uint256 indexed tenderId, uint256 amount)`

#### authorizeCaller / deauthorizeCaller

```solidity
function authorizeCaller(address caller) external onlyOwner
function deauthorizeCaller(address caller) external onlyOwner
```

### Read Functions

```solidity
function getDeposit(uint256 tenderId, address bidder) external view returns (uint256)
function getDepositStatus(uint256 tenderId, address bidder) external view returns (DepositStatus)
function requiredDeposit(uint256 tenderId) external view returns (uint256)
function totalEscrow(uint256 tenderId) external view returns (uint256)
```

---

## 5. BidderRegistry

**Inheritance:** `Ownable2Step`  
**Constructor:** `(address initialOwner)`

### Write Functions

#### registerBidder

```solidity
function registerBidder(address bidder) external onlyOwner
```

**Reverts:** `ZeroAddress()`, `BidderAlreadyRegistered()`  
**Events:** `BidderRegistered(address indexed bidder)`

#### removeBidder

```solidity
function removeBidder(address bidder) external onlyOwner
```

Uses swap-and-pop for gas-efficient array removal.  
**Reverts:** `BidderNotRegistered()`  
**Events:** `BidderRemoved(address indexed bidder)`

#### Recording Functions (onlyAuthorized)

```solidity
function recordBid(address bidder) external onlyAuthorized
function recordWin(address bidder) external onlyAuthorized
function recordSlash(address bidder) external onlyAuthorized
function recordCompletion(address bidder) external onlyAuthorized
```

**Events:** `BidRecorded`, `WinRecorded`, `SlashRecorded`, `CompletionRecorded`

#### Authorization

```solidity
function addAuthorizedCaller(address caller) external onlyOwnerOrAuthorized
function removeAuthorizedCaller(address caller) external onlyOwner
```

### Read Functions

```solidity
function isVerified(address bidder) external view returns (bool)
function getProfile(address bidder) external view returns (BidderProfile memory)
function getReputationScore(address bidder) external view returns (uint256)
function bidderCount() external view returns (uint256)
function allBidders(uint256 index) external view returns (address)
```

**Reputation Formula:**
```
score = (totalWins + completedOnTime) * 100 / (totalBids + totalSlashes * 2)
Default (no bids): 50
Capped at: 100
```

---

## 6. DisputeManager

**Inheritance:** `Ownable2Step`, `ReentrancyGuard`  
**Constructor:** `(address _escrow, address _municipality, address _registry)`

### Constants

```solidity
uint256 public constant COMPLAINT_STAKE = 0.01 ether;
```

### Write Functions

#### fileCompanyComplaint

```solidity
function fileCompanyComplaint(
    uint256 tenderId, address accused, string calldata reason
) external payable returns (uint256)
```

**Reverts:** `InsufficientStake()` — msg.value < 0.01 ETH  
**Events:** `DisputeFiled(uint256 indexed disputeId, uint256 indexed tenderId, address complainant, address accused)`

#### fileCitizenComplaint

```solidity
function fileCitizenComplaint(
    uint256 tenderId, address accused, string calldata reason
) external returns (uint256)
```

No stake required.

#### executeCourtOrder

```solidity
function executeCourtOrder(
    uint256 tenderId, address accused, string calldata reason, bool shouldFreeze
) external returns (uint256)
```

**Access:** `msg.sender == courtAuthority` only  
**Reverts:** `NotCourtAuthority()`

#### resolveDispute

```solidity
function resolveDispute(uint256 disputeId, DisputeStatus resolution) external onlyOwner nonReentrant
```

**Resolution Logic:**
- `Slashed`: slash escrow to municipality + recordSlash + return stake
- `Dismissed`: burn stake to municipality (StakeBurned event)

**Reverts:** `InvalidDisputeId()`, `DisputeAlreadyResolved()`

### Read Functions

```solidity
function getDispute(uint256 disputeId) external view returns (Dispute memory)
function getDisputesByTender(uint256 tenderId) external view returns (uint256[] memory)
function disputeCount() external view returns (uint256)
function municipality() external view returns (address)
function courtAuthority() external view returns (address)
```

---

## 7. PriceEscalation

**Inheritance:** `Ownable2Step`  
**Constructor:** `()`

### Constants

```solidity
uint256 public constant MAX_PRICE_CHANGE_BPS = 5000;  // 50%
uint256 public constant BPS_DENOMINATOR = 10000;
```

### Write Functions

#### setEscalationRule

```solidity
function setEscalationRule(
    uint256 tenderId, bytes32 materialId,
    uint256 baselinePrice, uint256 thresholdPercent,
    uint256 capPercent, uint256 periodSeconds
) external onlyOwner
```

#### evaluateEscalation

```solidity
function evaluateEscalation(uint256 tenderId, bytes32 materialId) external onlyOwner returns (uint256 extraPayment)
```

**Reverts:** `NoRuleSet()`, `PeriodNotElapsed()`, `EscalationCapExceeded()`

#### updateOraclePrice

```solidity
function updateOraclePrice(bytes32 materialId, uint256 newPrice) external onlyOwner
```

**Reverts:** `PriceChangeExceedsLimit()` — change > 50% of current price

#### setTenderPrice

```solidity
function setTenderPrice(uint256 tenderId, uint256 price) external onlyOwner
```

### Read Functions

```solidity
function getBaselinePrice(uint256 tenderId, bytes32 materialId) external view returns (uint256)
function getLatestPrice(bytes32 materialId) external view returns (uint256)
function getTotalEscalation(uint256 tenderId) external view returns (uint256)
function tenderPrice(uint256 tenderId) external view returns (uint256)
```

---

## 8. CollisionDetector

**Inheritance:** `ZamaEthereumConfig`, `Ownable2Step`  
**Constructor:** `()`

### Write Functions

#### checkCollision

```solidity
function checkCollision(uint256 tenderId, inEuint64[] calldata encPrices) external onlyOwner
```

**Requirements:** `!collisionChecked[tenderId]`, `encPrices.length >= 2`, `encPrices.length <= 10`  
**Events:** `CollisionCheckStarted(uint256 indexed tenderId, uint256 bidCount)`

#### setCollisionResult

```solidity
function setCollisionResult(uint256 tenderId, bool result) external onlyOwner
```

Called after Gateway decryption callback.  
**Requirements:** `collisionChecked[tenderId]`  
**Events:** `CollisionCheckCompleted(uint256 indexed tenderId, bool hasCollision)`

### Read Functions

```solidity
function collisionChecked(uint256 tenderId) external view returns (bool)
function collisionDetected(uint256 tenderId) external view returns (bool)
function collisionHandle(uint256 tenderId) external view returns (bytes32)
```
