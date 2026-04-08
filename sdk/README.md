# @sealtender/sdk

TypeScript SDK for the **SealTender** FHE-encrypted procurement protocol. Provides a high-level client for interacting with all on-chain contracts, including automatic FHE bid encryption via [fhevmjs](https://docs.zama.ai/fhevm).

## Installation

```bash
npm install @sealtender/sdk ethers
```

> **Peer dependency:** `ethers ^6.0.0` must be installed separately.

## Quick Start

```typescript
import { SealTenderClient, TenderState } from "@sealtender/sdk";
import { ethers } from "ethers";

// Connect to provider
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Initialize client with deployed contract addresses
const client = new SealTenderClient(signer, {
  factory: "0x...",
  escrow: "0x...",
  registry: "0x...",
  disputeManager: "0x...",
  escalation: "0x...",
  collisionDetector: "0x...",
  cusdc: "0x...",
});
```

## Workflows

### 1. Create a Tender (Municipality)

```typescript
const { tenderId, tenderAddress } = await client.createTender({
  description: "Istanbul Metro Extension Phase 3",
  deadline: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400), // 7 days
  weightYears: 30,
  weightProjects: 30,
  weightBond: 40,
  minYears: 5,
  minProjects: 3,
  minBond: 500_000n * 1_000_000n, // 500K USDC
  escrowAmount: ethers.parseEther("0.1"),
  maxBidders: 10n,
  minReputation: 50n,
});

console.log(`Tender #${tenderId} deployed at ${tenderAddress}`);
```

### 2. Submit a Bid (Company)

```typescript
// Bid data is automatically FHE-encrypted before submission
const txHash = await client.submitBid(tenderAddress, {
  price: 2_500_000n * 1_000_000n, // 2.5M USDC
  yearsExperience: 12,
  completedProjects: 8,
  bondCapacity: 1_000_000n * 1_000_000n, // 1M USDC
});

console.log(`Bid submitted: ${txHash}`);
```

### 3. Evaluate & Reveal (Municipality)

```typescript
// Start evaluation after deadline
await client.startEvaluation(tenderAddress);

// Submit pre-computed scores (from FHE decryption)
const scores = [850n, 720n, 910n];
await client.evaluateAll(tenderAddress, scores);

// Complete evaluation
await client.completeEvaluation(tenderAddress);

// Reveal winner
await client.revealWinner(tenderAddress, 2, 2_500_000n * 1_000_000n);

const winner = await client.getWinner(tenderAddress);
console.log(`Winner: ${winner.address}, Price: ${winner.price}`);
```

### 4. Escrow Management

```typescript
// Bidder deposits escrow
await client.deposit(0, ethers.parseEther("0.1"));

// Check deposit status
const info = await client.getEscrowInfo(0, bidderAddress);
console.log(`Deposited: ${info.amount}, Status: ${info.status}`);

// Release escrow to winner (municipality)
await client.release(0, winnerAddress);
```

### 5. File a Dispute

```typescript
// Company complaint (requires 0.01 ETH stake)
const disputeId = await client.fileCompanyComplaint(
  0,
  accusedAddress,
  "Evidence of bid price leakage to competitor"
);

// Citizen complaint (free)
const citizenDisputeId = await client.fileCitizenComplaint(
  0,
  accusedAddress,
  "Suspected ghost bidding activity"
);

// Resolve dispute (municipality/owner)
await client.resolveDispute(disputeId, DisputeStatus.Slashed);
```

### 6. Price Escalation

```typescript
// Set escalation rule for steel
await client.setEscalationRule(
  0,              // tenderId
  "STEEL_REBAR",  // materialId
  1000n,          // baselinePrice
  500n,           // thresholdPercent (5%)
  2000n,          // capPercent (20%)
  2592000n        // periodSeconds (30 days)
);

// Update oracle price
await client.updateOraclePrice("STEEL_REBAR", 1200n);

// Evaluate escalation
const extraPayment = await client.evaluateEscalation(0, "STEEL_REBAR");
console.log(`Extra payment due: ${extraPayment}`);
```

## API Reference

### Tender Lifecycle

| Method | Description | Access |
|--------|-------------|--------|
| `createTender(config)` | Create new tender | Owner |
| `getTenderCount()` | Total tender count | Public |
| `getTenderAddress(id)` | Get tender address by ID | Public |
| `getTenderConfig(addr)` | Get tender configuration | Public |
| `getTenderState(addr)` | Get current state | Public |
| `getAllTenders()` | List all tender addresses | Public |
| `cancelTender(addr)` | Cancel a tender | Owner |

### Bidding

| Method | Description | Access |
|--------|-------------|--------|
| `submitBid(addr, bid)` | Submit FHE-encrypted bid | Verified Bidder |
| `updateBid(addr, bid)` | Update existing bid | Bidder (before deadline) |
| `getMyBid(addr)` | Get own bid info | Bidder |
| `getBidderCount(addr)` | Number of bidders | Public |
| `hasBid(addr, bidder)` | Check if address has bid | Public |
| `getBidders(addr, s, e)` | List bidder addresses | Public |

### Evaluation

| Method | Description | Access |
|--------|-------------|--------|
| `startEvaluation(addr)` | Move to evaluation phase | Owner |
| `submitScore(addr, idx, score)` | Submit single score | Owner |
| `evaluateBatch(addr, s, e, scores)` | Submit batch scores | Owner |
| `evaluateAll(addr, scores)` | Submit all scores | Owner |
| `completeEvaluation(addr)` | Finalize evaluation | Owner |
| `revealWinner(addr, idx, price)` | Reveal winner | Owner |
| `getWinner(addr)` | Get winner info | Public |
| `getScore(addr, idx)` | Get bidder score | Public |

### Escrow

| Method | Description | Access |
|--------|-------------|--------|
| `deposit(id, amount)` | Deposit ETH escrow | Bidder |
| `getDeposit(id, bidder)` | Get deposit amount | Public |
| `getDepositStatus(id, bidder)` | Get deposit status | Public |
| `getEscrowInfo(id, bidder)` | Get full escrow info | Public |
| `release(id, bidder)` | Release to bidder | Authorized |
| `refund(id, bidder)` | Refund to bidder | Authorized |
| `freeze(id, bidder)` | Freeze deposit | Authorized |
| `unfreeze(id, bidder)` | Unfreeze deposit | Authorized |
| `slash(id, bidder, recipient)` | Slash deposit | Authorized |

### Registry

| Method | Description | Access |
|--------|-------------|--------|
| `registerBidder(addr)` | Register new bidder | Owner |
| `removeBidder(addr)` | Remove bidder | Owner |
| `isVerified(addr)` | Check verification | Public |
| `getProfile(addr)` | Get bidder profile | Public |
| `getReputationScore(addr)` | Get reputation (0-100) | Public |
| `getBidderRegistryCount()` | Total registered bidders | Public |

### Disputes

| Method | Description | Access |
|--------|-------------|--------|
| `fileCompanyComplaint(id, accused, reason)` | File company complaint (0.01 ETH) | Any |
| `fileCitizenComplaint(id, accused, reason)` | File citizen complaint (free) | Any |
| `resolveDispute(id, resolution)` | Resolve a dispute | Owner |
| `getDispute(id)` | Get dispute details | Public |
| `getDisputesByTender(id)` | Disputes for tender | Public |
| `getDisputeCount()` | Total dispute count | Public |

### Escalation

| Method | Description | Access |
|--------|-------------|--------|
| `setEscalationRule(id, mat, ...)` | Set price escalation rule | Owner |
| `evaluateEscalation(id, mat)` | Evaluate escalation | Owner |
| `updateOraclePrice(mat, price)` | Update oracle price | Owner |
| `setTenderPrice(id, price)` | Set tender total price | Owner |
| `getBaselinePrice(id, mat)` | Get baseline price | Public |
| `getLatestPrice(mat)` | Get latest oracle price | Public |
| `getTotalEscalation(id)` | Total escalation paid | Public |

### cUSDC Token

| Method | Description | Access |
|--------|-------------|--------|
| `mintCUSDC(to, amount)` | Mint cUSDC | Owner |
| `faucetCUSDC(amount)` | Mint to self | Owner |
| `getCUSDCBalance(addr)` | Get balance | Public |
| `approveCUSDC(spender, amount)` | Approve spender | Token Holder |

## Enums

```typescript
enum TenderState { Created, Bidding, Evaluating, Revealed, Completed, Cancelled }
enum DisputeType { Company, Citizen, CourtOrder }
enum DisputeStatus { Open, Investigating, Slashed, Frozen, Dismissed }
enum DepositStatus { None, Active, Frozen, Released, Refunded, Slashed }
```

## Utility Functions

```typescript
import {
  parseTenderState,
  formatUSDC,
  parseUSDC,
  materialIdToBytes32,
  bytes32ToMaterialId,
  tenderStateLabel,
} from "@sealtender/sdk";

formatUSDC(2500000000000n);        // "2,500,000"
parseUSDC("2,500,000.50");         // 2500000500000n
materialIdToBytes32("STEEL_REBAR"); // "0x535445454c5f5245424152..."
tenderStateLabel(TenderState.Bidding); // "Bidding"
```

## License

MIT
