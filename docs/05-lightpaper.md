# SealTender: Technical Lightpaper

**FHE-Encrypted Sealed-Bid Procurement on Ethereum**

Version 1.0 | April 2026

---

## Abstract

SealTender is an on-chain procurement protocol that uses Fully Homomorphic Encryption (FHE) to eliminate bid leakage — the single largest source of procurement fraud in the $13 trillion global public procurement market. By encrypting bid data with Zama's fhEVM and evaluating bids entirely on ciphertext, SealTender ensures that no party — including the contract owner, validators, or MEV searchers — can access bid contents before or during evaluation. Only the winning bid's price and bidder address are revealed post-evaluation, preserving the commercial confidentiality of all losing bids.

---

## 1. Problem Statement

### 1.1 Scale of Procurement Fraud

Public procurement accounts for approximately 12-15% of global GDP. The OECD estimates that 10-25% of procurement spending is lost to corruption, bid rigging, and fraud. Key attack vectors include:

- **Bid leakage:** Officials or system administrators expose competing bids to favored firms
- **Evaluator bias:** Subjective criteria are manipulated to favor predetermined winners
- **Ghost bidding:** Shell companies submit bids to simulate competition
- **Cover bidding:** Firms coordinate to submit complementary bids
- **Post-award manipulation:** Contract terms are altered after award

### 1.2 Limitations of Existing Solutions

| System | Privacy Model | Trust Model | Verifiability |
|--------|--------------|-------------|---------------|
| EKAP (Turkey) | Encrypted at rest | Trust system admin | Audit logs only |
| TED (EU) | Sealed envelopes | Trust committee | Post-hoc review |
| SAM.gov (US) | Database ACL | Trust platform | FOIA requests |
| Commit-Reveal | Hash commitment | No computation on commitments | Reveal phase exposes all |
| MPC | Secret sharing | Trust n-of-m parties | Complex setup |
| TEE (Intel SGX) | Hardware enclave | Trust hardware vendor | Side-channel risks |

None of these solutions enable **computation on encrypted bids** while maintaining **on-chain verifiability**.

---

## 2. FHE Operations in SealTender

### 2.1 Encrypted Data Types

| Field | FHE Type | Bits | Purpose |
|-------|----------|------|---------|
| Price | `euint64` | 64 | Bid amount in USDC |
| Years of Experience | `euint32` | 32 | Qualification gate |
| Completed Projects | `euint32` | 32 | Qualification gate |
| Bond Capacity | `euint64` | 64 | Financial capability |

**Total encrypted payload:** 192 bits per bid.

### 2.2 Encryption Flow

```
Client (fhevmjs)                    Contract (fhEVM)
─────────────────                    ─────────────────
1. Create encrypted input            
2. Add fields (add64, add32)         
3. Call encrypt()                    
4. Submit tx with ciphertexts ───►   5. Store encrypted bytes
                                     6. FHE operations on ciphertext
                                     7. Decryption request via Gateway
                              ◄───   8. Only winner revealed
```

### 2.3 Evaluation Operations

**Stage 1: Gate (Qualification Check)**

For each bidder `i`:
```
pass_years[i]    = FHE.gte(encYears[i], minYears)
pass_projects[i] = FHE.gte(encProjects[i], minProjects)
pass_bond[i]     = FHE.gte(encBond[i], minBond)
qualified[i]     = FHE.and(pass_years[i], FHE.and(pass_projects[i], pass_bond[i]))
```

**Stage 2: Price Ranking**

Among qualified bidders:
```
best_price = encPrice[0]  // initialized to first qualified
for i = 1..n:
    is_lower = FHE.lt(encPrice[i], best_price)
    is_qualified = qualified[i]
    should_update = FHE.and(is_lower, is_qualified)
    best_price = FHE.select(should_update, encPrice[i], best_price)
    best_idx = FHE.select(should_update, i, best_idx)
```

**Stage 3: Collision Detection (Optional)**

```
anyCollision = false
for i = 0..n:
    for j = i+1..n:
        anyCollision = FHE.or(anyCollision, FHE.eq(prices[i], prices[j]))
```

---

## 3. HCU Cost Analysis

### 3.1 Homomorphic Computation Units

Each FHE operation consumes HCU, which maps to gas cost on the EVM.

| Operation | HCU Cost | Gas (approx) |
|-----------|----------|--------------|
| `FHE.add` (euint64) | 1 | ~50K |
| `FHE.lt` (euint64) | 4 | ~200K |
| `FHE.eq` (euint64) | 4 | ~200K |
| `FHE.min` (euint64) | 6 | ~300K |
| `FHE.select` (euint64) | 3 | ~150K |
| `FHE.and` (ebool) | 1 | ~50K |
| `FHE.or` (ebool) | 1 | ~50K |
| `FHE.gte` (euint32) | 3 | ~150K |
| Decrypt request | 10 | ~500K |

### 3.2 Cost Per Tender (10 Bidders)

| Phase | Operations | Total HCU | Estimated Gas |
|-------|-----------|-----------|---------------|
| Gate (per bidder) | 3 gte + 2 and = 11 | 110 | ~5.5M |
| Ranking | 9 lt + 9 select + 9 and = 63 | 630 | ~6.3M (batched) |
| Collision | 45 eq + 44 or = 224 | 2,240 | ~11.2M |
| Decrypt | 1 request = 10 | 10 | ~500K |
| **Total** | | **2,990** | **~23.5M** |

At 30 gwei base fee on Sepolia: ~0.7 ETH per tender evaluation.

### 3.3 Scaling Considerations

| Bidders | Comparisons | Total Gas | Feasibility |
|---------|-------------|-----------|-------------|
| 3 | 3 | ~5M | Easy |
| 5 | 10 | ~10M | Comfortable |
| 10 | 45 | ~23M | Near block limit |
| 20 | 190 | ~95M | Exceeds block limit |
| 50 | 1,225 | ~610M | Impossible (single tx) |

This is why SealTender enforces `maxBidders <= 10`. For larger tenders, a tournament-style evaluation across multiple transactions would be required.

---

## 4. Trust Model

### 4.1 Trust Assumptions

| Component | Trust Level | Mitigation |
|-----------|------------|------------|
| Ethereum consensus | Trust majority of validators | Proven security (since 2015) |
| Zama fhEVM | Trust FHE implementation correctness | Open-source, audited |
| Zama KMS | Trust key management service | Threshold decryption planned |
| Zama Gateway | Trust decryption relay | Can be replaced with on-chain threshold |
| Contract owner | Trust municipality admin | Multi-sig + timelock planned |
| Oracle | Trust price feed (escalation) | Owner-controlled in hackathon scope |
| BidderRegistry | Trust KYC authority | Decentralized ID planned |

### 4.2 Information Leakage

| What is Leaked | Why | Mitigation |
|----------------|-----|------------|
| Number of bidders | On-chain array length | Acceptable (public in traditional) |
| Bidder addresses | On-chain mapping | Could use stealth addresses |
| Bid timestamps | Block timestamp | Acceptable |
| Bid existence | `bids[addr].exists` | Acceptable |
| Bid version count | `version` field | Acceptable |
| Winner identity | Required by law | Intentional |
| Winning price | Required by law | Intentional |

### 4.3 What is NOT Leaked

- Losing bid prices
- Any bid's qualification parameters
- Evaluation scores (before completion)
- Relative ranking of losers

---

## 5. Protocol Comparison

### 5.1 vs Commit-Reveal

| Feature | Commit-Reveal | SealTender |
|---------|--------------|------------|
| Bid privacy during evaluation | No (reveal required) | Yes (FHE) |
| Losing bid exposure | All bids revealed | Never revealed |
| On-chain computation | None | Full FHE evaluation |
| Trusted setup | None | None |
| Gas cost | Low (~100K) | High (~23M) |
| Complexity | Simple | Complex |

### 5.2 vs MPC

| Feature | MPC | SealTender |
|---------|-----|------------|
| Trust model | n-of-m parties | Single chain + KMS |
| Setup overhead | High (key ceremony) | Low (deploy contracts) |
| Communication rounds | Multiple | One tx |
| Composability | Poor | Full EVM |
| Liveness | Requires all parties online | Asynchronous |

### 5.3 vs TEE (Intel SGX)

| Feature | TEE | SealTender |
|---------|-----|------------|
| Trust model | Hardware vendor | Cryptographic |
| Side channels | Vulnerable | Immune |
| Verifiability | Attestation-based | On-chain proofs |
| Hardware requirement | Special CPU | Standard EVM |
| Cost | Low per operation | High per FHE op |

---

## 6. Token: ConfidentialUSDC

SealTender includes a ConfidentialUSDC (cUSDC) token — an ERC7984 confidential token that enables FHE-encrypted balances. This provides the foundation for future on-chain payment integration.

### 6.1 Features

| Feature | Description |
|---------|-------------|
| Wrap | Deposit USDC, receive FHE-encrypted cUSDC |
| Unwrap | Burn cUSDC, receive USDC back |
| Faucet | Testnet-only: mint up to 10,000 cUSDC per hour |
| FHE Balances | All balances stored as `euint64` — invisible to observers |
| ERC7984 | OpenZeppelin confidential token standard |

### 6.2 Integration Path

In production, cUSDC could replace ETH escrow for bid deposits, enabling fully encrypted payment flows where even deposit amounts are hidden.

---

## 7. Limitations and Honest Assessment

### 7.1 Technical Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| KMS trust dependency | Gateway can theoretically decrypt | Threshold decryption (roadmap) |
| 10-bidder maximum | Excludes large-scale tenders | Tournament evaluation (roadmap) |
| High gas cost (~23M per evaluation) | Expensive on mainnet | L2 FHE chains, batch optimization |
| Mock KYC whitelist | No real Sybil resistance | WorldID/Polygon ID integration |
| Single-chain only | No cross-border syndication | LayerZero/Hyperlane (roadmap) |
| Owner-dependent liveness | Evaluation requires owner action | Timelock + DAO governance |

### 7.2 Economic Limitations

- Gas costs make SealTender impractical for low-value procurements (<$100K)
- Escrow deposit in ETH exposes bidders to price volatility
- No incentive mechanism for oracle price feed accuracy (beyond sanity cap)

### 7.3 Legal Limitations

- Smart contract execution is not legally recognized in most jurisdictions
- On-chain identity does not satisfy government KYC requirements
- Cross-border procurement has regulatory complexity that on-chain logic cannot address

---

## 8. Future Work

1. **Threshold Decryption:** Replace Zama Gateway with on-chain threshold scheme (n-of-m key holders)
2. **Tournament Evaluation:** Support 50+ bidders via multi-round elimination across transactions
3. **Decentralized Identity:** WorldID/Polygon ID for Sybil-resistant, privacy-preserving KYC
4. **Cross-chain:** LayerZero/Hyperlane for multi-chain tender syndication
5. **DAO Governance:** Community-governed protocol parameters and dispute resolution
6. **ZK Proofs:** Combine FHE with ZK for client-side bid validation before submission
7. **Multi-Oracle Consensus:** Multiple Chainlink/Pyth feeds with TWAP for escalation
8. **L2 Deployment:** Lower gas costs via Zama's FHE L2 roadmap or validium model
9. **Confidential Payments:** Use cUSDC for escrow deposits, hiding deposit amounts
10. **Formal Verification:** Mathematical proof of evaluation correctness using Certora or Halmos

---

## 9. Conclusion

SealTender demonstrates that FHE is practical for real-world applications today. By encrypting four bid parameters and evaluating them entirely on-chain using Zama's fhEVM, we eliminate the most impactful procurement fraud vectors — bid leakage and evaluator bias — with mathematical guarantees rather than institutional trust.

The protocol operates within current fhEVM constraints (10 bidders, ~23M gas per evaluation) and provides a clear upgrade path as FHE efficiency improves. With 11 contracts, 367 tests, Chainlink oracle integration, and a ConfidentialUSDC token, SealTender is a complete prototype ready for production hardening.

For a $13 trillion market losing $1.3-3.25 trillion annually to fraud, even a 10% reduction through cryptographic enforcement represents extraordinary impact — $130 billion to $325 billion saved annually.

---

## 10. References

1. OECD (2023). "Government at a Glance 2023." OECD Publishing.
2. World Bank (2022). "Procurement Fraud and Corruption: Detection and Prevention."
3. Transparency International (2023). "Corruption Perceptions Index 2023."
4. Zama (2024). "fhEVM: Confidential Smart Contracts on EVM." https://docs.zama.ai/fhevm
5. Chillotti, I. et al. (2020). "TFHE: Fast Fully Homomorphic Encryption over the Torus." Journal of Cryptology.
6. European Parliament (2014). "Directive 2014/24/EU on public procurement."
7. Republic of Turkey (2002). "Public Procurement Law No. 4734."
8. Chainlink (2024). "Data Feeds — AggregatorV3Interface." https://docs.chain.link
9. OpenZeppelin (2024). "Contracts v5.x — Ownable2Step, ReentrancyGuard, Pausable."
10. Ethereum Foundation (2024). "EVM — Cancun Upgrade (EIP-4844)."
