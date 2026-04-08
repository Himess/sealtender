# SealTender: Demo Video Script

**Duration:** 3:00  
**Format:** Screen recording + voiceover  
**Tone:** Technical but accessible

---

## 0:00 - 0:30 | The Problem

**[Screen: Title card — "SealTender: FHE-Encrypted Procurement" on dark background]**
**[Visual: Logo animation, fade in with subtle particle effect]**

**Voiceover:**
> "Public procurement is a 13 trillion dollar market. Up to 25% is lost to fraud — that is 3.25 trillion dollars every year."

**[Screen: Animated counter ticking up from $0 to $3.25T with red highlight]**
**[Visual: World map with hotspots: Japan (Dango), Brazil (Lava Jato), UK (NHS Construction)]**

> "In Japan, construction cartels called 'dango' rigged bids for decades. In Brazil, the Lava Jato scandal exposed 5.3 billion dollars in procurement fraud at Petrobras. In the UK, six firms coordinated hospital construction bids for ten years."

**[Screen: Three icons representing each fraud type with severity bars]**

> "The root cause is simple: when humans can see bid prices before evaluation, corruption becomes inevitable. Bid leakage, evaluator bias, ghost bidding — these are systemic failures in every procurement system worldwide."

**[Screen: EKAP, TED, SAM.gov logos crossed out with X marks]**

> "From Turkey's EKAP to the EU's TED to the US SAM.gov — no existing system solves this. What if bids could be evaluated without ever being seen?"

---

## 0:30 - 1:00 | The Solution

**[Screen: Architecture diagram showing 11 contracts in hierarchical layout]**
**[Visual: Zoom into each contract as mentioned, highlight connections]**

**Voiceover:**
> "SealTender uses Fully Homomorphic Encryption — FHE — to encrypt bids on-chain. Price, experience, project count, and bond capacity are all encrypted using Zama's fhEVM."

**[Screen: Animation showing plaintext "2,500,000 USDC" transforming into encrypted ciphertext bytes]**
**[Visual: Lock icon over each of the 4 parameters: euint64 price, euint32 years, euint32 projects, euint64 bond]**

> "The key innovation: evaluation happens on encrypted data. The smart contract performs gate checks — are you qualified? — and price ranking — who is cheapest? — entirely on ciphertext using FHE.ge, FHE.lt, and FHE.select operations."

**[Screen: Visual showing FHE.ge(encYears, minYears) with question mark output, then FHE.lt(price_A, price_B) with boolean output]**

> "No party — not the municipality, not validators, not MEV bots — can see any bid at any point. Only the winner's address and price are revealed through Zama's Gateway decryption with KMS signature verification. All losing bids remain encrypted forever."

**[Screen: Padlock icons over 9 bids, one unlocking with green check]**

---

## 1:00 - 2:00 | Live Demo

### 1:00 - 1:15 | Create Tender

**[Screen: SealTender frontend — Create Tender form]**

**Voiceover:**
> "Let me show you. As a municipality, I create a tender for road construction. I set the deadline, weights, minimum qualifications, and escrow amount. These weights are public — a legal requirement."

**[Action: Fill form → Submit → Show TenderCreated event in console]**

### 1:15 - 1:30 | Submit Bids

**[Screen: Switch to Bidder 1 account]**

> "Now, as Company A, I submit my bid. Watch the console — fhevmjs encrypts all four parameters client-side before the transaction."

**[Action: Submit bid → Show encryption happening → Tx confirmed]**

**[Screen: Switch to Bidder 2 account]**

> "Company B submits their bid. Notice: I cannot see Company A's bid, and Company A cannot see mine."

**[Action: Submit second bid → Show encrypted bytes on-chain]**

### 1:30 - 1:45 | Evaluate

**[Screen: Switch back to Municipality account]**

> "After the deadline, I start evaluation. The contract checks minimums on encrypted data, then ranks by encrypted price. All on-chain, all verifiable, but no bid is ever exposed."

**[Action: Start evaluation → Submit scores → Complete evaluation]**

### 1:45 - 2:00 | Reveal Winner

**[Screen: Reveal Winner action]**

> "And the winner is revealed. Only this: Company A at 2.5 million USDC. Company B's bid? Still encrypted. Forever."

**[Action: Reveal winner → Show WinnerRevealed event → Dashboard update]**

---

## 2:00 - 2:30 | Advanced Features

**[Screen: Split screen showing 3 modules]**

### Escrow & Disputes (2:00 - 2:10)

> "Every bidder deposits escrow before bidding. If a company files a complaint and it is upheld, the accused's escrow is slashed to the municipality. False complaints? Your stake gets burned."

**[Screen: Show dispute flow diagram]**

### Price Escalation with Chainlink (2:10 - 2:20)

> "For long-term contracts, material prices change. Our escalation module integrates Chainlink AggregatorV3 oracles for real-time price feeds. When steel or cement prices exceed thresholds, the system automatically calculates and sends extra payment to the winner from a pre-funded escalation budget."

**[Screen: Show Chainlink feed → PriceEscalation → auto-payment flow]**
**[Visual: Steel price chart going up, threshold line crossed, payment arrow to winner]**

### Collision Detection (2:20 - 2:30)

> "And for cartel detection: our collision detector uses FHE equality checks to flag identical bid prices — all without revealing what those prices are."

**[Screen: Show collision check result]**

---

## 2:30 - 3:00 | Closing

**[Screen: Tech stack overview — Solidity, Zama fhEVM, OpenZeppelin, Hardhat, Next.js, wagmi]**

**Voiceover:**
> "SealTender is built on Solidity 0.8.27, Zama fhEVM, OpenZeppelin, and Hardhat. Eleven contracts, 367 tests, deployed and verified on Sepolia. Plus a ConfidentialUSDC token with FHE-encrypted balances and wrap/unwrap support."

**[Screen: Split — left: SealTender features, right: comparison table vs EKAP vs Commit-Reveal]**

> "But we are honest about limitations. The KMS is a trust point. Maximum 10 bidders per tender due to FHE gas costs. KYC is a mock whitelist. These are documented, not hidden."

**[Screen: Roadmap slide — Threshold decryption, WorldID, L2 deployment, DAO governance]**

> "The roadmap is clear: threshold decryption for trustless reveals, real identity verification, L2 deployment for lower costs, and DAO governance. FHE is ready for production today — and SealTender proves it."

**[Screen: Final card — dark background with SealTender logo]**
**[Visual: GitHub URL, Sepolia contract addresses, team info]**

> "SealTender. Sealed bids. Open government. The 13 trillion dollar market deserves cryptographic integrity."

**[Screen: Fade to black with tagline: "Bids encrypted. Trust eliminated."]**

---

## Production Notes

- **Recording resolution:** 1920x1080, 60fps
- **Audio:** External mic, noise-reduced, normalize to -14 LUFS
- **Font:** Space Grotesk (headings), Inter (body) — matching the frontend
- **Console overlay:** Show transaction hashes and events in a semi-transparent panel (bottom-right)
- **Transitions:** Smooth fade between sections (0.5s), no flashy effects
- **Music:** Subtle ambient background, no lyrics — suggest "Corporate Technology" style
- **Length target:** 2:50-3:00 (do not exceed)
- **Color scheme:** Match frontend — dark mode with blue (#3B82F6) and green (#10B981) accents
- **Code display:** Use Fira Code font for any code snippets, with syntax highlighting

## Slide Inventory

| Time | Slide Type | Content |
|------|-----------|---------|
| 0:00 | Title card | Logo + "FHE-Encrypted Procurement" |
| 0:05 | Infographic | $13T market, fraud counter |
| 0:15 | World map | Fraud hotspots (Japan, Brazil, UK) |
| 0:25 | Icons | Three fraud types with severity |
| 0:30 | Architecture | 11-contract diagram |
| 0:40 | Animation | Plaintext → FHE encryption |
| 0:50 | FHE ops | FHE.ge, FHE.lt, FHE.select visual |
| 1:00 | Screen rec | Frontend — Create Tender form |
| 1:15 | Screen rec | Frontend — Submit Bid (encryption visible) |
| 1:30 | Screen rec | Frontend — Evaluate (batch processing) |
| 1:45 | Screen rec | Frontend — WinnerRevealed event |
| 2:00 | Diagram | Dispute flow (stake → slash/burn) |
| 2:10 | Diagram | Chainlink → PriceEscalation → payment |
| 2:20 | Diagram | CollisionDetector pairwise FHE.eq |
| 2:30 | Tech stack | All technologies listed |
| 2:40 | Comparison | SealTender vs EKAP vs Commit-Reveal |
| 2:50 | Limitations | Honest assessment (5 points) |
| 2:55 | Final card | Logo, GitHub, addresses, tagline |
