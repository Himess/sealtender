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
| Testing | 294 unit tests passing + 5 KMS-signed integration tests on Zama testnet |
| Chain | Ethereum Sepolia (testnet) — chainId 11155111 |

## Deployed Contracts (Sepolia)

| Contract | Address | Verified |
|----------|---------|----------|
| BidderRegistry | [`0x2E8037626102ca3393ab9EfE7a3A254b30B236CA`](https://repo.sourcify.dev/contracts/full_match/11155111/0x2E8037626102ca3393ab9EfE7a3A254b30B236CA/) | ✅ Sourcify |
| BidEscrow | [`0x1635eb515c80eEf52CD88d34109C83D8b5321647`](https://repo.sourcify.dev/contracts/full_match/11155111/0x1635eb515c80eEf52CD88d34109C83D8b5321647/) | ✅ Sourcify |
| ConfidentialUSDC | [`0xCe493fFaBf3763df8057E58c22a6dC6a65806553`](https://repo.sourcify.dev/contracts/full_match/11155111/0xCe493fFaBf3763df8057E58c22a6dC6a65806553/) | ✅ Sourcify |
| PriceEscalation | [`0x75ea85aaB4d130cFE2Bf0C7121a6535Fc3a1fa9a`](https://repo.sourcify.dev/contracts/full_match/11155111/0x75ea85aaB4d130cFE2Bf0C7121a6535Fc3a1fa9a/) | ✅ Sourcify |
| CollisionDetector | [`0x3e8c0eDC536bce66ba8ef161eC40E7fA39d38Aee`](https://repo.sourcify.dev/contracts/full_match/11155111/0x3e8c0eDC536bce66ba8ef161eC40E7fA39d38Aee/) | ✅ Sourcify |
| TenderFactory | [`0x5e2A776D44D63200285fAc230922aFd45A2EEb5C`](https://repo.sourcify.dev/contracts/full_match/11155111/0x5e2A776D44D63200285fAc230922aFd45A2EEb5C/) | ✅ Sourcify |
| DisputeManager | [`0x2424AE8B6d41F813bca1Bf669f23f355fDb5979B`](https://repo.sourcify.dev/contracts/full_match/11155111/0x2424AE8B6d41F813bca1Bf669f23f355fDb5979B/) | ✅ Sourcify |

External dependencies wired in this deployment:

| Dependency | Address (Sepolia) |
|------------|-------------------|
| Circle USDC (underlying for ConfidentialUSDC) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Pyth Network (PriceEscalation fallback oracle) | `0xDd24F84d36BF92C65F92307595335bdFab5Bbd21` |

> **Audited deployment** (April 2026). Three Critical + two High issues from the internal audit pass were patched before redeploy: ConfidentialUSDC drain via flat `unwrap` (now uses OpenZeppelin's canonical `ERC7984ERC20Wrapper` with KMS-signed `finalizeUnwrap`), CollisionDetector result spoofing (now requires KMS-signed proof), evaluateBatch cross-batch ACL bug (added `FHE.allowThis` on running min/winner ciphertexts), and BidderRegistry privilege escalation (closed via dedicated `tenderManager` role). See [docs/06-security.md](./docs/06-security.md) for the full audit log.

### Getting test USDC on Sepolia

ConfidentialUSDC is backed 1:1 by real Circle USDC — there is intentionally no faucet built into the wrapper (a faucet would mint unbacked cUSDC supply, which under any flat-unwrap path would drain the real USDC reserves of legitimate wrappers). To get test USDC for wrap operations:

1. Visit [faucet.circle.com](https://faucet.circle.com) and select **Ethereum Sepolia**
2. Paste your wallet address — Circle drips test USDC directly to it
3. Approve `ConfidentialUSDC` to spend the USDC, then call `wrap(to, amount)`

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

## Trust Model

SealTender's trust surface decomposes into three independent layers; each is auditable in isolation, and the failure mode of any one layer is bounded.

### 1. Privacy — trust-minimized

Bid contents (price, years of experience, projects completed, performance bond) are encrypted client-side under Zama's threshold KMS network. The KMS distributes shares across `t-of-n` validators; no single validator (and no Coprocessor, no relayer, no contract owner) can decrypt a ciphertext on its own. As long as the threshold is not breached, all losing bids remain confidential **forever** — there is no on-chain endpoint that can leak them.

### 2. Integrity — trust-minimized via KMS signatures

Every value that crosses the encrypted/clear boundary is gated by `FHE.checkSignatures(handles, cleartexts, decryptionProof)`, which verifies the threshold-signed decryption inside the EVM and reverts on any signature mismatch. This binds the cleartext that the contract uses to the exact ciphertext it published — the tender owner cannot forge a winner address, the collision detector cannot fabricate a "no collision" verdict, and ConfidentialUSDC cannot release underlying USDC against an under-collateralized burn.

| Decryption site | Verifier |
|---|---|
| `EncryptedTender.revealWinner` | `FHE.checkSignatures` over (winnerIdx, price) |
| `CollisionDetector.setCollisionResult` | `FHE.checkSignatures` over (bool result) |
| `ConfidentialUSDC.finalizeUnwrap` (inherited from OZ) | `FHE.checkSignatures` over (uint64 unwrapAmount) |

### 3. Liveness — fully permissionless reveal pipeline (v4) + announcement timelock (v5)

Starting **v4** (May 2026) the entire reveal pipeline is permissionless and gated only by timelocks, removing the tender owner's unilateral power to time-manipulate evaluations:

- `evaluateBatch(...)` — anyone can crank evaluation in batches once the bidding deadline has passed. The encrypted FHE.lt + FHE.select chain is invariant to caller.
- `requestReveal()` — anyone can promote the running winner ciphertexts to publicly decryptable once `block.timestamp >= deadline + REVEAL_TIMELOCK` (60 s in this build, 7 days in production target).
- `revealWinner(idx, price, addr, proof)` — anyone in possession of a valid KMS-signed decryption proof can finalize the reveal. The 9-of-13 threshold KMS attestation is the only security gate.

Starting **v5** (May 2026) the reveal flow is split into two phases that mirror Türkiye's 4734 Sayılı Kamu İhale Kanunu Madde 41 distinction between *kararın kesinleşmesi* and *kamuya ilan*:

| Phase | Function | Effect |
|---|---|---|
| Reveal | `revealWinner(idx, price, addr, proof)` | KMS-attested 3-handle tuple validated; `_pendingWinnerAddress` set; `revealed=true`; **public `winnerAddress` getter still returns `address(0)`** |
| Announce | `announceWinner()` (permissionless after `revealedAt + ANNOUNCE_TIMELOCK`) or `ownerAnnounceEarly()` | `winnerAddress = _pendingWinnerAddress`; registry win recorded; winnerSink forwarded; `WinnerAnnounced` event emitted |

`ANNOUNCE_TIMELOCK` is a constant — 60 seconds in this demo build, 48 hours in the production target (matching the public-notice window used by KIK procurement).

**Escape hatch:** `forceCancelStuckReveal()` is still available after `revealTimeout` (1–30 days, default 7) has elapsed since `requestReveal` — transitions the tender to `Cancelled` so bidders can recover their escrows via `BidEscrow.claimRefund` (also permissionless after Cancelled).

### 4. Disputes — 3-of-5 multi-sig court (v4)

`DisputeManager.resolveDispute(...)` accepts calls from EITHER the contract owner (legacy path, useful for emergencies) OR `courtAuthority`, which v4 wires to the new `ArbitrationSafe` contract. ArbitrationSafe is a 3-of-5 N-of-M gate — three independent arbitrators (KIK seat + İdari Mahkeme seat + 2 sector representatives + 1 NGO seat) must agree on the (disputeId, resolution) tuple before any escrow gets slashed. Mirrors the commission-decision requirement in 4734 Madde 12.

Production deployments should disown `DisputeManager` to the same `ArbitrationSafe` via `Ownable2Step.transferOwnership`, removing the owner backdoor and leaving multi-sig as the sole authority.

## Security

- **FHE Encryption:** Bids are mathematically unreadable by all parties (threshold KMS)
- **KMS-signed decryption:** Every cleartext-from-ciphertext transition is bound by `FHE.checkSignatures`
- **OpenZeppelin canonical wrappers:** `ERC7984ERC20Wrapper` for ConfidentialUSDC (Zama-recommended)
- **ReentrancyGuard:** All ETH transfer functions + EncryptedTender.submitBid protected
- **Ownable2Step:** Two-step ownership transfer on critical contracts
- **Pausable:** Emergency pause on tender contracts and ConfidentialUSDC (excluding `finalizeUnwrap` — that path stays open to preserve user-fund liveness)
- **Custom Errors:** Gas-efficient error handling throughout
- **Input Validation:** Deadline, maxBidders ≤ 50, reputation checks, oracle stale-round detection (`answeredInRound >= roundId`)
- **Privilege model:** Dedicated `tenderManager` role on BidderRegistry (no escalation surface)
- **Reveal liveness:** `forceCancelStuckReveal` permissionless after 7-day timeout

See [docs/06-security.md](docs/06-security.md) for the full internal audit log including the C/H/M/L issues patched in the April 2026 audit pass.

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

## Roadmap (v5 → v∞)

What we've shipped:

- **v3** (April 2026) — base FHE pipeline, ERC-7984 wrapper, oracle-backed price escalation, full audit pass
- **v4** (May 2026) — permissionless reveal pipeline, 3-of-5 ArbitrationSafe, governance hardening
- **v5** (May 2026) — `eaddress` encrypted winner address, 3-handle KMS attestation, announcement timelock, user-side bid decryption, escalation-auth telemetry event
- **v6** (May 2026, code-committed, deployment deferred to maintain v5 demo state) — three-mode disclosure: `publishAllBids` + `recordLoserBidPlaintext` give the procurement entity an opt-in path to publicly land losing-bid plaintexts via per-bidder KMS roundtrips. Three modes: (1) **default privacy** — losing bids stay sealed forever; (2) **public audit** — `publishAllBids` after announcement matches 4734 Madde 36 transparency requirement; (3) **selective auditor** — off-chain via existing `FHE.delegateUserDecryption`. Default mode unchanged so existing flows are not disrupted.

What's next, in priority order:

| Tier | Feature | Effort | Why |
|---|---|---|---|
| Quick | Multi-stage tendering (PreQual → Price → BAFO) | 2 weeks | Real Turkish KIK workflow; current single-round is a simplification |
| Quick | Lot/category bundling + partial awards | 1.5 weeks | Most public RFPs have 5–10 lots, partial awards are standard |
| Quick | Performance bond escrow (post-award milestone-locked, 5–10 % of contract) | 1 week | KIK KHK requirement; BidEscrow extension only |
| Medium | Encrypted reputation scores w/ `delegateUserDecryption` | 1.5 weeks | Selective reveal to evaluators; uses v0.11.1 delegation API |
| Medium | Merkle-root sealed bidder list (ZK proof of inclusion) | 2 weeks | Hides bidder identities until award; Noir/circom toolchain |
| Medium | Sub-contractor encrypted disclosure (revealed to KIK only) | 1 week | Anti-collusion compliance; re-uses delegation flow |
| Medium | Tournament-tree comparison (n→log n) | 1.5 weeks | Unlocks 50+ bidders within block budget |
| Medium | ConfUSDC (ERC-7984) bid bonds | 1 week | Native confidential settlement; token contract already live |
| Research | `FHE.randEuint` stochastic tie-breaking | 1 week | KIK allows it; underused FHE primitive |
| Research | Cross-chain announcement (Mainnet) + bids (FHE chain) via CCIP | 2 weeks | Censorship resistance + discoverability |
| Research | zk-VM proof of evaluation correctness (RISC0/SP1) | 4 weeks+ | Provable winner derivation; eliminates owner trust on batching |

Production hardening that needs operator action (not contract changes):

- Set tender owner to a multi-sig or DAO module (Ownable2Step)
- Set `ANNOUNCE_TIMELOCK` to 48 hours and `REVEAL_TIMELOCK` to 7 days for mainnet
- Disown `DisputeManager` to `ArbitrationSafe` so owner backdoor is removed
- Whitelist Idare addresses via a future `IdareRegistry` contract gated by KIK

## License

MIT
