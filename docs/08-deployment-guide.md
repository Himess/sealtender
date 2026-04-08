# SealTender: Deployment Guide

## Prerequisites

- Node.js >= 18
- Hardhat with fhEVM plugin
- Sepolia ETH (testnet faucet)
- Etherscan API key (for verification)

## Environment Setup

Create `.env` in the project root:

```env
DEPLOYER_PRIVATE_KEY=0x...your_private_key...
SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co
ETHERSCAN_API_KEY=your_etherscan_api_key
```

## Deployment Order

Contracts must be deployed in this exact order due to constructor dependencies.

### Step 1: BidderRegistry

```bash
npx hardhat deploy --network sepolia --tags BidderRegistry
```

**Constructor:** `(address initialOwner)` — deployer address

**Output:**
```
BidderRegistry deployed to: 0x...
```

### Step 2: TenderFactory

```bash
npx hardhat deploy --network sepolia --tags TenderFactory
```

**Constructor:** `(address _registry)` — BidderRegistry address from Step 1

### Step 3: BidEscrow

```bash
npx hardhat deploy --network sepolia --tags BidEscrow
```

**Constructor:** `()` — no arguments

### Step 4: DisputeManager

```bash
npx hardhat deploy --network sepolia --tags DisputeManager
```

**Constructor:** `(address _escrow, address _municipality, address _registry)`

- `_escrow`: BidEscrow address from Step 3
- `_municipality`: Municipality treasury address (deployer or multisig)
- `_registry`: BidderRegistry address from Step 1

### Step 5: PriceEscalation

```bash
npx hardhat deploy --network sepolia --tags PriceEscalation
```

**Constructor:** `()` — no arguments

### Step 6: CollisionDetector

```bash
npx hardhat deploy --network sepolia --tags CollisionDetector
```

**Constructor:** `()` — no arguments  
**Note:** Inherits `ZamaEthereumConfig` for FHE integration.

### Step 7: MockUSDC (Testnet Only)

```bash
npx hardhat deploy --network sepolia --tags MockUSDC
```

---

## Post-Deployment Configuration

After all contracts are deployed, run the setup script to wire them together.

### Wire Factory

```typescript
// factory.setDisputeManager(disputeManager.address)
await factory.setDisputeManager(DISPUTE_MANAGER_ADDRESS);

// factory.setEscalation(escalation.address)
await factory.setEscalation(ESCALATION_ADDRESS);

// factory.setCollisionDetector(collisionDetector.address)
await factory.setCollisionDetector(COLLISION_DETECTOR_ADDRESS);
```

### Authorize Callers

```typescript
// Allow DisputeManager to slash escrow
await escrow.authorizeCaller(DISPUTE_MANAGER_ADDRESS);

// Allow DisputeManager to record slashes in registry
await registry.addAuthorizedCaller(DISPUTE_MANAGER_ADDRESS);
```

### Verify Wiring

```typescript
console.log("Factory.disputeManager:", await factory.disputeManager());
console.log("Factory.escalation:", await factory.escalation());
console.log("Factory.collisionDetector:", await factory.collisionDetector());
console.log("Escrow.authorizedCallers[DM]:", await escrow.authorizedCallers(DM));
console.log("Registry.authorizedCallers[DM]:", await registry.authorizedCallers(DM));
```

---

## Contract Verification

### Automatic (via Hardhat)

```bash
npx hardhat verify --network sepolia DEPLOYED_ADDRESS "constructor_arg_1" "constructor_arg_2"
```

### Examples

```bash
# BidderRegistry
npx hardhat verify --network sepolia 0x... "0xDEPLOYER_ADDRESS"

# TenderFactory
npx hardhat verify --network sepolia 0x... "0xREGISTRY_ADDRESS"

# BidEscrow (no args)
npx hardhat verify --network sepolia 0x...

# DisputeManager
npx hardhat verify --network sepolia 0x... "0xESCROW" "0xMUNICIPALITY" "0xREGISTRY"

# PriceEscalation (no args)
npx hardhat verify --network sepolia 0x...

# CollisionDetector (no args)
npx hardhat verify --network sepolia 0x...
```

### Sourcify

Sourcify verification is enabled in `hardhat.config.ts`:

```typescript
sourcify: {
  enabled: true,
}
```

---

## Deployed Addresses (Sepolia)

> Update these after each deployment. Store in `deployments/sepolia/` directory.

| Contract | Address | Verified |
|----------|---------|----------|
| BidderRegistry | `0x...` | Pending |
| TenderFactory | `0x...` | Pending |
| BidEscrow | `0x...` | Pending |
| DisputeManager | `0x...` | Pending |
| PriceEscalation | `0x...` | Pending |
| CollisionDetector | `0x...` | Pending |
| MockUSDC | `0x...` | Pending |

---

## Deployment Checklist

### Pre-Deployment

- [ ] `.env` configured with private key and RPC URL
- [ ] Deployer account has sufficient Sepolia ETH (>0.5 ETH recommended)
- [ ] All contracts compile: `npx hardhat compile`
- [ ] All tests pass: `npx hardhat test`

### Deployment

- [ ] BidderRegistry deployed and verified
- [ ] TenderFactory deployed and verified
- [ ] BidEscrow deployed and verified
- [ ] DisputeManager deployed and verified
- [ ] PriceEscalation deployed and verified
- [ ] CollisionDetector deployed and verified
- [ ] MockUSDC deployed and verified

### Post-Deployment

- [ ] Factory wired to DisputeManager, Escalation, CollisionDetector
- [ ] Escrow authorized DisputeManager as caller
- [ ] Registry authorized DisputeManager as caller
- [ ] Court authority set on DisputeManager (if applicable)
- [ ] All addresses saved to `deployments/sepolia/`
- [ ] Frontend `.env.local` updated with addresses

### Smoke Test

- [ ] Register a test bidder via BidderRegistry
- [ ] Create a tender via TenderFactory
- [ ] Submit an encrypted bid via frontend
- [ ] Complete full evaluation cycle
- [ ] File and resolve a test dispute
- [ ] Deposit and release escrow

---

## Upgrade Path

SealTender contracts are NOT upgradeable by design. Each tender is a separate contract deployed by the factory.

To upgrade the protocol:

1. Deploy new contract versions
2. Deploy a new TenderFactory pointing to the new contracts
3. Existing tenders continue operating on old contracts
4. New tenders use the new contracts

This ensures no active tender can be affected by protocol changes.

---

## Gas Costs (Sepolia Estimates)

| Operation | Gas | Cost @ 30 gwei |
|-----------|-----|----------------|
| Deploy BidderRegistry | ~1.2M | ~0.036 ETH |
| Deploy TenderFactory | ~2.1M | ~0.063 ETH |
| Deploy BidEscrow | ~1.8M | ~0.054 ETH |
| Deploy DisputeManager | ~2.4M | ~0.072 ETH |
| Deploy PriceEscalation | ~1.5M | ~0.045 ETH |
| Deploy CollisionDetector | ~1.0M | ~0.030 ETH |
| createTender | ~3.5M | ~0.105 ETH |
| submitBid | ~500K | ~0.015 ETH |
| Full evaluation (10 bidders) | ~23M | ~0.690 ETH |
| deposit (escrow) | ~80K | ~0.002 ETH |
| fileCompanyComplaint | ~150K | ~0.005 ETH |
| **Total deployment** | **~10M** | **~0.30 ETH** |

**Recommended deployer balance:** 1.0 ETH (covers deployment + several test tenders).
