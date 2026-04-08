# SealTender: Demo Video Script

**Duration:** 3:00  
**Format:** Screen recording + voiceover  
**Tone:** Technical but accessible

---

## 0:00 - 0:30 | The Problem

**[Screen: Title card — "SealTender: FHE-Encrypted Procurement"]**

**Voiceover:**
> "Public procurement is a 13 trillion dollar market. Up to 25% is lost to fraud — that is 3.25 trillion dollars every year. The root cause? When humans can see bid prices before evaluation, corruption becomes inevitable."

**[Screen: Animated infographic showing $13T market → $1.3-3.25T fraud]**

> "Bid leakage, evaluator bias, ghost bidding — these are not edge cases. They are systemic failures in every procurement system worldwide, from Turkey's EKAP to EU's TED to the US SAM.gov."

**[Screen: Three icons representing each fraud type]**

> "What if bids could be evaluated without ever being seen?"

---

## 0:30 - 1:00 | The Solution

**[Screen: Architecture diagram showing 7 contracts]**

**Voiceover:**
> "SealTender uses Fully Homomorphic Encryption — FHE — to encrypt bids on-chain. Price, experience, project count, and bond capacity are all encrypted using Zama's fhEVM."

**[Screen: Show encryption flow — plain text → FHE → on-chain]**

> "The key innovation: evaluation happens on encrypted data. The smart contract compares encrypted values, ranks bidders, and determines the winner — all without decrypting a single bid."

**[Screen: Show FHE.lt and FHE.min operations visually]**

> "Only the winner's address and price are revealed. All losing bids remain encrypted forever."

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

### Price Escalation (2:10 - 2:20)

> "For long-term contracts, material prices change. Our oracle-based escalation module automatically adjusts payments when steel or cement prices exceed thresholds."

**[Screen: Show escalation rule configuration]**

### Collision Detection (2:20 - 2:30)

> "And for cartel detection: our collision detector uses FHE equality checks to flag identical bid prices — all without revealing what those prices are."

**[Screen: Show collision check result]**

---

## 2:30 - 3:00 | Closing

**[Screen: Tech stack overview]**

**Voiceover:**
> "SealTender is built on Solidity 0.8.27, Zama fhEVM, OpenZeppelin, and Hardhat. Seven contracts, 258 tests, deployed on Sepolia."

**[Screen: Comparison table — SealTender vs EKAP vs Commit-Reveal]**

> "This is not a theoretical exercise. With FHE, we can make procurement transparent AND private — for the first time in history."

**[Screen: Final card — GitHub URL, team info]**

> "SealTender. Sealed bids. Open government."

---

## Production Notes

- **Recording resolution:** 1920x1080, 60fps
- **Audio:** External mic, noise-reduced
- **Font:** Space Grotesk (headings), Inter (body) — matching the frontend
- **Console overlay:** Show transaction hashes and events in a semi-transparent panel
- **Transitions:** Smooth fade between sections, no flashy effects
- **Music:** Subtle ambient background, no lyrics
- **Length target:** 2:50-3:00 (do not exceed)
