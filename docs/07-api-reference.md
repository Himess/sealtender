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

**Inheritance:** `Ownable2Step`  
**Constructor:** `(address _registry, address _escrow)`

**Reverts:** `ZeroAddress()` if either parameter is zero.

### Write Functions

#### createTender

```solidity
function createTender(TenderConfig calldata _config) external onlyOwner returns (uint256 tenderId, address tenderAddress)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| _config | TenderConfig | Full tender configuration |
| **Returns** | uint256, address | Tender ID and deployed EncryptedTender contract address |

**Reverts:**
- `"Deadline must be future"` — deadline in the past
- `"Must allow at least 1 bidder"` — maxBidders == 0

**Events:** `TenderCreated(uint256 indexed tenderId, address tenderContract, string description)`

**Side Effects:**
1. Deploys new `EncryptedTender(tenderId, _config, registry, escrow)`
2. Stores in `tenders[tenderId]` and `tenderConfigs[tenderId]`
3. Calls `BidEscrow(escrow).setRequiredDeposit(tenderId, _config.escrowAmount)` if escrow > 0
4. Calls `BidderRegistry(registry).addAuthorizedCaller(tenderAddress)`

#### setDisputeManager

```solidity
function setDisputeManager(address _dm) external onlyOwner
```

**Reverts:** `ZeroAddress()`  
**Events:** `DisputeManagerSet(address indexed dm)`

#### setEscalation

```solidity
function setEscalation(address _esc) external onlyOwner
```

**Reverts:** `ZeroAddress()`  
**Events:** `EscalationSet(address indexed esc)`

#### setCollisionDetector

```solidity
function setCollisionDetector(address _cd) external onlyOwner
```

**Reverts:** `ZeroAddress()`  
**Events:** `CollisionDetectorSet(address indexed cd)`

### Read Functions

#### getTender

```solidity
function getTender(uint256 id) external view returns (address)
```

#### getTenderConfig

```solidity
function getTenderConfig(uint256 id) external view returns (TenderConfig memory)
```

#### getAllTenders

```solidity
function getAllTenders() external view returns (address[] memory)
```

Returns all tender addresses. Gas-intensive for large counts; use `getTenders()` for pagination.

#### getTenders

```solidity
function getTenders(uint256 offset, uint256 limit) external view returns (address[] memory)
```

Paginated tender list. Returns empty array if offset >= tenderCount.

#### tenderCount

```solidity
function tenderCount() external view returns (uint256)
```

---

## 3. EncryptedTender

**Inheritance:** `ZamaEthereumConfig`, `Ownable2Step`, `Pausable`  
**Constructor:** `(uint256 _tenderId, TenderConfig memory _config, address _registry, address _escrow)`

### Write Functions

#### submitBid

```solidity
function submitBid(
    externalEuint64 _encPrice, bytes calldata _priceProof,
    externalEuint32 _encYears, bytes calldata _yearsProof,
    externalEuint32 _encProjects, bytes calldata _projectsProof,
    externalEuint64 _encBond, bytes calldata _bondProof
) external onlyVerified beforeDeadline inState(TenderState.Bidding) whenNotPaused
```

Handles both new bids and updates (if `hasBid[sender]` is true). Uses `FHE.fromExternal()` for input validation and `FHE.allowThis()`/`FHE.allow()` for access control.

**Checks (in order):**
1. `registry.isVerified(msg.sender)` → `NotVerifiedBidder()` (onlyVerified modifier)
2. `block.timestamp < config.deadline` → `DeadlinePassed()` (beforeDeadline modifier)
3. `state == TenderState.Bidding` → `InvalidState()` (inState modifier)
4. `bidders.length < config.maxBidders` → `MaxBiddersReached()`
5. `escrow.deposits(tenderId, msg.sender) >= config.escrowAmount` → `EscrowRequired()`
6. `registry.getReputationScore(msg.sender) >= config.minReputation` → `InsufficientReputation()`

**Events:** `BidSubmitted(address indexed bidder, uint256 timestamp)` (new bid) or `BidUpdated(address indexed bidder, uint256 version)` (update)

**Side Effects:** Calls `registry.recordBid(msg.sender)` if this contract is authorized

#### evaluateBatch

```solidity
function evaluateBatch(uint256 startIdx, uint256 endIdx) external onlyOwner afterDeadline whenNotPaused
```

Performs on-chain FHE evaluation of bids in the specified range. Automatically transitions state from Bidding to Evaluating on first call.

**FHE Operations per bidder:**
1. `FHE.ge(encYears, minYears)` — gate check
2. `FHE.ge(encProjects, minProjects)` — gate check
3. `FHE.ge(encBond, minBond)` — gate check
4. `FHE.and()` — combine qualification results
5. `FHE.select(qualified, encPrice, maxUint64)` — mask unqualified
6. `FHE.lt(effectivePrice, currentMinPrice)` — price comparison
7. `FHE.select(isLower, ...)` — update minimum price and winner index

**Checks:**
1. `block.timestamp >= config.deadline` → `DeadlineNotPassed()` (afterDeadline)
2. `state == Evaluating` (or Bidding on first call) → `NotEvaluating()`
3. `startIdx < endIdx` → `InvalidRange()`
4. `endIdx <= bidders.length` → `EndExceedsBidders()`
5. `startIdx == evaluatedCount` → `MustEvaluateInOrder()`

**Events:** `EvaluationBatchCompleted(uint256 startIdx, uint256 endIdx)`, `EvaluationCompleted(uint256 totalBidders)` (when all evaluated)

#### requestReveal

```solidity
function requestReveal() external onlyOwner
```

Makes the encrypted winner index and price publicly decryptable via `FHE.makePubliclyDecryptable()`. Stores handles for later verification.

**Checks:** `evaluationComplete == true` → `EvaluationNotComplete()`, `!revealed` → `AlreadyRevealed()`  
**Events:** `RevealRequested(bytes32 idxHandle, bytes32 priceHandle)`

#### revealWinner

```solidity
function revealWinner(uint256 winnerIdx, uint256 price, bytes calldata decryptionProof) external onlyOwner
```

Verifies the KMS decryption proof using `FHE.checkSignatures()`, then stores the winner address and price.

**Checks:** `!revealed`, `winnerIdx < bidders.length`  
**State Change:** `→ Revealed`  
**Side Effects:** Calls `registry.recordWin(winnerAddress)` if authorized  
**Events:** `WinnerRevealed(address winner, uint256 price)`

#### cancelTender

```solidity
function cancelTender() external onlyOwner
```

**State Change:** `Any → Cancelled`  
**Events:** `TenderCancelled(uint256 timestamp)`

#### pause / unpause

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

### Read Functions

#### getMyBid

```solidity
function getMyBid() external view returns (
    euint64 encPrice, euint32 encYears, euint32 encProjects,
    euint64 encBond, uint256 timestamp, uint256 version
)
```

Returns the caller's own encrypted bid data. Only the bid owner can decrypt via reencryption.

#### getConfig

```solidity
function getConfig() external view returns (TenderConfig memory)
```

#### getBidders

```solidity
function getBidders(uint256 offset, uint256 limit) external view returns (address[] memory)
```

Paginated bidder list. Returns empty array if offset >= total.

#### Other Views

```solidity
function tenderId() external view returns (uint256)
function state() external view returns (TenderState)
function winnerAddress() external view returns (address)
function revealedPrice() external view returns (uint256)
function revealed() external view returns (bool)
function evaluatedCount() external view returns (uint256)
function evaluationComplete() external view returns (bool)
function hasBid(address bidder) external view returns (bool)
function getBidVersion(address bidder) external view returns (uint256)
function winnerIdxHandle() external view returns (bytes32)
function winnerPriceHandle() external view returns (bytes32)
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
**Dependencies:** `@chainlink/contracts AggregatorV3Interface`

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

**Events:** `EscalationRuleSet(uint256 indexed tenderId, bytes32 materialId)`

#### evaluateEscalation

```solidity
function evaluateEscalation(uint256 tenderId, bytes32 materialId) external onlyOwner returns (uint256 extraPayment)
```

**Reverts:** `NoRuleSet()`, `PeriodNotElapsed()`, `EscalationCapExceeded()`, `InsufficientEscalationBudget(tenderId, required, available)`, `PaymentFailed()`

**Side Effects:**
- Updates `totalEscalationPaid[tenderId]`
- Updates `rule.lastEvaluated` timestamp
- If `tenderWinner[tenderId]` is set and budget sufficient, sends ETH to winner automatically

**Events:** `EscalationTriggered(uint256 indexed tenderId, bytes32 materialId, uint256 extraPayment)`, `EscalationPayment(uint256 indexed tenderId, address indexed winner, uint256 amount)`

#### updateOraclePrice

```solidity
function updateOraclePrice(bytes32 materialId, uint256 newPrice) external onlyOwner
```

Manual fallback for materials without Chainlink feeds.

**Reverts:** `PriceChangeExceedsLimit()` — change > 50% of current price  
**Events:** `OraclePriceUpdated(bytes32 indexed materialId, uint256 newPrice)`

#### setPriceFeed

```solidity
function setPriceFeed(bytes32 materialId, address feed) external onlyOwner
```

Links a Chainlink AggregatorV3Interface feed to a material ID. When set, `getLatestPrice()` reads from Chainlink instead of `latestPrices`.

**Events:** `PriceFeedSet(bytes32 indexed materialId, address feed)`

#### setTenderWinner

```solidity
function setTenderWinner(uint256 tenderId, address winner) external onlyOwner
```

Sets the winner address for automatic escalation payments. Called after tender evaluation is complete.

#### setTenderPrice

```solidity
function setTenderPrice(uint256 tenderId, uint256 price) external onlyOwner
```

#### depositEscalationBudget

```solidity
function depositEscalationBudget(uint256 tenderId) external payable
```

Anyone (typically the municipality) can deposit ETH as escalation budget for a tender. The budget is consumed when `evaluateEscalation()` triggers auto-payment to the winner.

**Events:** `EscalationBudgetDeposited(uint256 indexed tenderId, uint256 amount)`

### Read Functions

```solidity
function getBaselinePrice(uint256 tenderId, bytes32 materialId) external view returns (uint256)
function getLatestPrice(bytes32 materialId) public view returns (uint256)
function getTotalEscalation(uint256 tenderId) external view returns (uint256)
function tenderPrice(uint256 tenderId) external view returns (uint256)
function priceFeeds(bytes32 materialId) external view returns (address)
function escalationBudget(uint256 tenderId) external view returns (uint256)
function tenderWinner(uint256 tenderId) external view returns (address)
```

#### getLatestPrice Logic

```solidity
// 1. Check if Chainlink feed exists for this material
// 2. If yes: call latestRoundData(), validate price > 0 and freshness < 1 day
// 3. If no: fallback to manual latestPrices[materialId]
```

---

## 8. CollisionDetector

**Inheritance:** `ZamaEthereumConfig`, `Ownable2Step`  
**Constructor:** `()`

### Write Functions

#### checkCollision

```solidity
function checkCollision(
    uint256 tenderId,
    externalEuint64[] calldata encPrices,
    bytes[] calldata proofs
) external onlyOwner
```

Performs O(n^2) pairwise FHE equality checks on encrypted bid prices.

**Requirements:**
- `!collisionChecked[tenderId]` — "Already checked"
- `encPrices.length >= 2` — "Need at least 2 bids"
- `encPrices.length <= 10` — "Max 10 bids"
- `encPrices.length == proofs.length` — "Length mismatch"

**FHE Operations:** For each pair (i,j): `FHE.eq(prices[i], prices[j])` + `FHE.or(anyCollision, eq)`  
**Post-operation:** `FHE.makePubliclyDecryptable(anyCollision)` + store handle

**Events:** `CollisionCheckStarted(uint256 indexed tenderId, uint256 bidCount)`

#### setCollisionResult

```solidity
function setCollisionResult(uint256 tenderId, bool result) external onlyOwner
```

Called after Gateway decryption callback resolves the collision boolean.  
**Requirements:** `collisionChecked[tenderId]` — "Not checked yet"  
**Events:** `CollisionCheckCompleted(uint256 indexed tenderId, bool hasCollision)`

### Read Functions

```solidity
function collisionChecked(uint256 tenderId) external view returns (bool)
function collisionDetected(uint256 tenderId) external view returns (bool)
function collisionHandle(uint256 tenderId) external view returns (bytes32)
function isCollisionDetected(uint256 tenderId) external view returns (bool checked, bool detected)
```

---

## 9. ConfidentialUSDC

**Inheritance:** `ZamaEthereumConfig`, `ERC7984`, `Ownable2Step`  
**Constructor:** `(address initialOwner)`  
**Token Standard:** ERC7984 (OpenZeppelin Confidential Contracts)

### Constants

```solidity
uint256 public constant FAUCET_MAX = 10_000 * 1e6;    // 10,000 USDC
uint256 public constant FAUCET_COOLDOWN = 1 hours;
```

### Admin Functions

#### mint

```solidity
function mint(address to, uint256 amount) external onlyOwner
```

Mints encrypted cUSDC tokens to the specified address. Amount is converted to `euint64` via `FHE.asEuint64()`.

**Events:** `Minted(address indexed to, uint256 amount)`

#### burn

```solidity
function burn(address from, uint256 amount) external onlyOwner
```

Burns encrypted cUSDC tokens from the specified address.

**Events:** `Burned(address indexed from, uint256 amount)`

#### setUnderlyingUSDC

```solidity
function setUnderlyingUSDC(address _usdc) external onlyOwner
```

Sets the underlying USDC token address for wrap/unwrap functionality.

**Events:** `UnderlyingUSDCSet(address indexed token)`

### Wrap/Unwrap Functions

#### wrap

```solidity
function wrap(uint256 amount) external
```

Transfers `amount` of underlying USDC from caller to contract, mints equivalent encrypted cUSDC.

**Requirements:** `underlyingUSDC` must be set, amount > 0, caller must have approved contract  
**Reverts:** `WrapDisabled()`, `WrapAmountZero()`  
**Events:** `Wrapped(address indexed user, uint256 amount)`

#### unwrap

```solidity
function unwrap(uint256 amount) external
```

Burns encrypted cUSDC from caller, transfers equivalent underlying USDC back.

**Requirements:** `underlyingUSDC` must be set, amount > 0, caller must have sufficient cUSDC balance  
**Reverts:** `WrapDisabled()`, `WrapAmountZero()`  
**Events:** `Unwrapped(address indexed user, uint256 amount)`

### Faucet

#### faucet

```solidity
function faucet(uint256 amount) external
```

Testnet-only function that mints encrypted cUSDC without requiring underlying USDC.

**Requirements:**
- `amount > 0` — `FaucetAmountZero()`
- `amount <= 10_000 * 1e6` — `FaucetAmountExceedsMax()`
- `block.timestamp >= lastFaucetTime[sender] + 1 hour` — `FaucetCooldown()`

**Events:** `FaucetUsed(address indexed user, uint256 amount)`

---

## 10. MockUSDC (Test Only)

**Inheritance:** `ERC20`  
**Constructor:** `()` — name "Mock USDC", symbol "USDC"

```solidity
function mint(address to, uint256 amount) external  // No access control (test only)
function decimals() public pure override returns (uint8)  // Returns 6
```

---

## 11. MockV3Aggregator (Test Only)

Chainlink `AggregatorV3Interface` mock for PriceEscalation testing.

```solidity
constructor(uint8 decimals_, int256 initialPrice)
function updateAnswer(int256 newPrice) external
function setUpdatedAt(uint256 ts) external
function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)
function decimals() external view returns (uint8)
```
