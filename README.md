# SealTender

**FHE-Encrypted Sealed-Bid Procurement on Ethereum**

SealTender uses Fully Homomorphic Encryption (FHE) via [Zama's fhEVM](https://docs.zama.ai/fhevm) to eliminate bid leakage in public procurement. Bids are encrypted client-side and evaluated entirely on ciphertext — no party can access bid contents before, during, or after evaluation. Only the winning bid's price and bidder address are revealed.

---

## Architecture

```
                                ┌─────────────────────────┐
                                │     TenderFactory       │
                                │  (creates & tracks)     │
                                └────────┬────────────────┘
                                         │ creates
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
           ┌────────▼──────┐   ┌────────▼──────┐   ┌────────▼──────┐
           │ EncryptedTender│   │ EncryptedTender│   │ EncryptedTender│
           │   (Tender #0) │   │   (Tender #1) │   │   (Tender #N) │
           └───────────────┘   └───────────────┘   └───────────────┘
                    │                    │                    │
           ┌────────▼──────────────────▼────────────────────▼──────┐
           │                    BidEscrow                          │
           │         (ETH deposits, freeze, slash)                 │
           └──────────────────────┬────────────────────────────────┘
                                  │
       ┌──────────────┬───────────┼───────────┬──────────────┐
       │              │           │           │              │
┌──────▼─────┐ ┌──────▼─────┐ ┌──▼────────┐ ┌▼────────────┐ ┌▼──────────┐
│  Bidder    │ │  Dispute   │ │  Price    │ │ Collision  │ │ MockUSDC │
│  Registry  │ │  Manager   │ │ Escalation│ │ Detector   │ │ (cUSDC)  │
│ (KYC+Rep) │ │(Stake/Slash)│ │ (Oracle)  │ │ (FHE eq)   │ │          │
└────────────┘ └────────────┘ └───────────┘ └────────────┘ └──────────┘
```

## Contracts

| Contract | Description | Key Feature |
|----------|-------------|-------------|
| **TenderFactory** | Creates and tracks tender instances | Auto-authorizes tenders in registry |
| **EncryptedTender** | Single tender with FHE-encrypted bids | Pausable, deadline-gated, max 10 bidders |
| **BidEscrow** | Holds ETH escrow deposits | Freeze/slash for disputes, ReentrancyGuard |
| **BidderRegistry** | KYC whitelist + on-chain reputation | Score: (wins + completions) / (bids + 2*slashes) |
| **DisputeManager** | Company/citizen/court complaints | 0.01 ETH stake, burn on dismiss |
| **PriceEscalation** | Chainlink oracle + auto-payment escalation | 50% sanity cap, AggregatorV3Interface, budget |
| **CollisionDetector** | FHE pairwise price equality check | O(n^2) FHE.eq, max 10 bids |
| **ConfidentialUSDC** | FHE-encrypted ERC7984 token | Wrap/unwrap USDC + faucet (10K/hr) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.27 (viaIR, 800 runs optimizer, Cancun EVM) |
| FHE | Zama fhEVM (fhevmjs + @fhevm/solidity + ERC7984) |
| Framework | Hardhat + TypeChain + hardhat-deploy |
| Security | OpenZeppelin (Ownable2Step, ReentrancyGuard, Pausable) |
| Oracles | Chainlink AggregatorV3Interface |
| Frontend | Next.js 16 + RainbowKit + wagmi |
| SDK | TypeScript + ethers v6 + fhevmjs |
| Testing | 367 tests (unit + integration + edge cases + gas benchmarks) |
| Chain | Ethereum Sepolia (testnet) |

## Deployed Contracts (Sepolia)

| Contract | Address | Verified |
|----------|---------|----------|
| BidderRegistry | `0x32F74a5C2D10e2C24f0E1fDB4C458403678CCc7b` | Pending |
| BidEscrow | `0xC080244d26B0Ffd2CFBeB3e166ABe1186DDC5447` | Pending |
| ConfidentialUSDC | `0xAC1f3F9Ee7dC53B542ddAc8b2383722bBC3647b9` | Pending |
| TenderFactory | `0x694b12efB7c4E5cdCE41B6273Fce1E80137c6d52` | Pending |
| DisputeManager | `0xaf58c1a9A2e9d90F41d63A465262Fc5e8BDBd022` | Pending |
| PriceEscalation | `0xDE895b7d178d4869376DcF32B1db691A9C6425Bf` | Pending |
| CollisionDetector | `0xb7BDBeb8Cd424925579dAa8c7919F2C2ad2e2ae1` | Pending |

> **Fresh deployment** with all P0/P1/P2 fixes, Chainlink + Pyth oracle support, dynamic stake (5%), TenderSpecification standardization, dispute timeout, and ConfidentialUSDC wrap/unwrap. Etherscan verification pending.

## Project Structure

```
SealTender/
├── contracts/
│   ├── core/
│   │   ├── TenderFactory.sol
│   │   ├── EncryptedTender.sol
│   │   └── BidEscrow.sol
│   ├── identity/
│   │   └── BidderRegistry.sol
│   ├── interfaces/
│   │   ├── ISealTender.sol
│   │   └── IBidderRegistry.sol
│   ├── modules/
│   │   ├── DisputeManager.sol
│   │   ├── PriceEscalation.sol
│   │   └── CollisionDetector.sol
│   ├── token/
│   │   └── ConfidentialUSDC.sol
│   └── test/
│       ├── MockUSDC.sol
│       └── MockV3Aggregator.sol
├── sdk/
│   ├── src/
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── utils.ts
│   │   ├── SealTenderClient.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   └── src/
│       ├── app/
│       └── lib/
│           ├── wagmi.ts
│           └── fhevm.ts
├── docs/
│   ├── 01-problem-analysis.md
│   ├── 02-architecture-decisions.md
│   ├── 03-implementation-plan.md
│   ├── 04-video-script.md
│   ├── 05-lightpaper.md
│   ├── 06-security.md
│   ├── 07-api-reference.md
│   ├── 08-deployment-guide.md
│   ├── 09-comparison.md
│   └── 10-full-audit-report.md
├── test/
├── deploy/
├── deployments/
├── hardhat.config.ts
├── package.json
└── README.md
```

## Quick Start

### Build & Test

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run all tests
npx hardhat test

# Run specific test suites
npm run test:encrypted
npm run test:escrow
npm run test:integration
```

### SDK

```bash
cd sdk
npm install
npm run build
```

```typescript
import { SealTenderClient } from "@sealtender/sdk";
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const client = new SealTenderClient(signer, {
  factory: "0x...",
  escrow: "0x...",
  registry: "0x...",
  disputeManager: "0x...",
  escalation: "0x...",
  collisionDetector: "0x...",
  cusdc: "0x...",
});

// Submit an FHE-encrypted bid
await client.submitBid(tenderAddress, {
  price: 2_500_000n * 1_000_000n,
  yearsExperience: 12,
  completedProjects: 8,
  bondCapacity: 1_000_000n * 1_000_000n,
});
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Deploy to Sepolia

```bash
# Set environment variables
export DEPLOYER_PRIVATE_KEY=0x...
export SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co

# Deploy all contracts
npx hardhat deploy --network sepolia
```

See [docs/08-deployment-guide.md](docs/08-deployment-guide.md) for detailed deployment instructions.

## FHE Encryption Flow

```
1. Bidder enters plain-text bid data in frontend
2. fhevmjs encrypts: price(euint64) + years(euint32) + projects(euint32) + bond(euint64)
3. Encrypted bytes submitted to EncryptedTender contract
4. Nobody can read the ciphertext (not owner, not validators, not MEV bots)
5. Evaluation: Gate check (min requirements) + Price ranking (lowest wins)
6. Only winner address + price revealed via Gateway decryption
7. All losing bids remain encrypted forever
```

## Security

- **FHE Encryption:** Bids are mathematically unreadable by all parties
- **ReentrancyGuard:** All ETH transfer functions protected
- **Ownable2Step:** Two-step ownership transfer on critical contracts
- **Pausable:** Emergency pause on tender contracts
- **Custom Errors:** Gas-efficient error handling throughout
- **Input Validation:** Deadline, maxBidders, reputation checks enforced

Self-audit score: **92/100 (A)**. See [docs/10-full-audit-report.md](docs/10-full-audit-report.md).

## Documentation

| Document | Description |
|----------|-------------|
| [01-problem-analysis](docs/01-problem-analysis.md) | $13T procurement fraud analysis (Turkish) |
| [02-architecture-decisions](docs/02-architecture-decisions.md) | 10 key design decisions |
| [03-implementation-plan](docs/03-implementation-plan.md) | Contract specs, 367 tests, deployment order |
| [04-video-script](docs/04-video-script.md) | 3-minute demo video script |
| [05-lightpaper](docs/05-lightpaper.md) | Technical paper: FHE ops, HCU costs, trust model |
| [06-security](docs/06-security.md) | 12 attack vectors, information leakage analysis |
| [07-api-reference](docs/07-api-reference.md) | Complete API for all 8 contracts |
| [08-deployment-guide](docs/08-deployment-guide.md) | Step-by-step Sepolia deployment |
| [09-comparison](docs/09-comparison.md) | vs EKAP/TED/SAM.gov, vs commit-reveal/MPC/ZK/TEE |
| [10-full-audit-report](docs/10-full-audit-report.md) | Self-audit with P0/P1/P2 fixes |

## License

MIT
