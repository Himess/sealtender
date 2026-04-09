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

Contracts must be deployed in this exact order due to constructor dependencies. The deployment script is in `deploy/001_deploy_all.ts` and deploys everything in one go with `npx hardhat deploy --network sepolia --tags SealTender`.

### Step 1: BidderRegistry

```bash
npx hardhat deploy --network sepolia --tags BidderRegistry
```

**Constructor:** `(address initialOwner)` — deployer address

**Output:**
```
BidderRegistry deployed to: 0x...
```

### Step 2: BidEscrow

```bash
npx hardhat deploy --network sepolia --tags BidEscrow
```

**Constructor:** `()` — no arguments

### Step 3: ConfidentialUSDC

```bash
npx hardhat deploy --network sepolia --tags ConfidentialUSDC
```

**Constructor:** `(address initialOwner)` — deployer address  
**Note:** Inherits `ZamaEthereumConfig` and `ERC7984` for FHE-encrypted token balances.

### Step 4: TenderFactory

```bash
npx hardhat deploy --network sepolia --tags TenderFactory
```

**Constructor:** `(address _registry, address _escrow)` — BidderRegistry + BidEscrow addresses

### Step 5: DisputeManager

```bash
npx hardhat deploy --network sepolia --tags DisputeManager
```

**Constructor:** `(address _escrow, address _municipality, address _registry)`

- `_escrow`: BidEscrow address from Step 2
- `_municipality`: Municipality treasury address (deployer or multisig)
- `_registry`: BidderRegistry address from Step 1

### Step 6: PriceEscalation

```bash
npx hardhat deploy --network sepolia --tags PriceEscalation
```

**Constructor:** `()` — no arguments  
**Note:** Supports Chainlink AggregatorV3Interface via `setPriceFeed()` post-deploy.

### Step 7: CollisionDetector

```bash
npx hardhat deploy --network sepolia --tags CollisionDetector
```

**Constructor:** `()` — no arguments  
**Note:** Inherits `ZamaEthereumConfig` for FHE integration.

---

## Post-Deployment Configuration

After all contracts are deployed, run the setup script to wire them together.

### Authorize Factory

```typescript
// CRITICAL: Factory needs escrow access to call setRequiredDeposit() in createTender()
await escrow.authorizeCaller(FACTORY_ADDRESS);

// Factory needs registry access to call addAuthorizedCaller() for new tenders
await registry.addAuthorizedCaller(FACTORY_ADDRESS);
```

### Authorize DisputeManager

```typescript
// CRITICAL: Without this, DisputeManager.resolveDispute() → escrow.slash() will revert
await escrow.authorizeCaller(DISPUTE_MANAGER_ADDRESS);

// Allow DisputeManager to record slashes in registry
await registry.addAuthorizedCaller(DISPUTE_MANAGER_ADDRESS);
```

### Wire Factory

```typescript
await factory.setDisputeManager(DISPUTE_MANAGER_ADDRESS);
await factory.setEscalation(ESCALATION_ADDRESS);
await factory.setCollisionDetector(COLLISION_DETECTOR_ADDRESS);
```

### Verify Wiring

```typescript
console.log("Factory.disputeManager:", await factory.disputeManager());
console.log("Factory.escalation:", await factory.escalation());
console.log("Factory.collisionDetector:", await factory.collisionDetector());
console.log("Escrow.authorizedCallers[Factory]:", await escrow.authorizedCallers(FACTORY));
console.log("Escrow.authorizedCallers[DM]:", await escrow.authorizedCallers(DM));
console.log("Registry.authorizedCallers[Factory]:", await registry.authorizedCallers(FACTORY));
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

- [ ] Escrow authorized TenderFactory as caller
- [ ] Registry authorized TenderFactory as caller
- [ ] Escrow authorized DisputeManager as caller
- [ ] Registry authorized DisputeManager as caller
- [ ] Factory wired to DisputeManager, Escalation, CollisionDetector
- [ ] Court authority set on DisputeManager (if applicable)
- [ ] Chainlink price feeds configured on PriceEscalation (if applicable)
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

---

## Troubleshooting

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `NotAuthorized()` on createTender | Factory not authorized in Escrow | `escrow.authorizeCaller(factory.address)` |
| `CallerNotAuthorized()` on recordBid | Tender not authorized in Registry | Factory should auto-authorize; check `registry.addAuthorizedCaller(factory)` |
| `NotAuthorized()` on slash | DisputeManager not authorized in Escrow | `escrow.authorizeCaller(disputeManager.address)` |
| `Stale Chainlink data` on evaluateEscalation | Chainlink feed not updated in 24h | Check feed address, use testnet feed |
| `Invalid Chainlink price` on getLatestPrice | Chainlink feed returns price <= 0 | Verify feed contract is deployed and initialized |
| `Stale price` on getLatestPrice | Pyth feed older than 1 hour | Update Pyth price via pyth.updatePriceFeeds() before reading |
| `DepositAlreadyExists()` on deposit | Bidder already deposited for this tender | Each bidder can only deposit once per tender |
| `MaxBiddersReached()` on submitBid | 10 bidders already submitted | Tender is full; create a new tender |
| `FaucetCooldown()` on cUSDC faucet | Less than 1 hour since last faucet use | Wait for cooldown to expire |
| viaIR compilation errors | Solidity optimizer issue | Ensure `hardhat.config.ts` has `viaIR: true` and `evmVersion: "cancun"` |

### Verifying Post-Deploy Wiring

Run this check script after deployment to ensure all cross-contract permissions are correct:

```typescript
const escrowContract = await ethers.getContractAt("BidEscrow", ESCROW_ADDRESS);
const registryContract = await ethers.getContractAt("BidderRegistry", REGISTRY_ADDRESS);
const factoryContract = await ethers.getContractAt("TenderFactory", FACTORY_ADDRESS);

// These should all return true
console.assert(await escrowContract.authorizedCallers(FACTORY_ADDRESS), "Factory not authorized in Escrow");
console.assert(await escrowContract.authorizedCallers(DM_ADDRESS), "DM not authorized in Escrow");
console.assert(await registryContract.authorizedCallers(FACTORY_ADDRESS), "Factory not authorized in Registry");
console.assert(await registryContract.authorizedCallers(DM_ADDRESS), "DM not authorized in Registry");

// These should return the correct addresses
console.assert(await factoryContract.disputeManager() === DM_ADDRESS, "Factory.disputeManager wrong");
console.assert(await factoryContract.escalation() === ESCALATION_ADDRESS, "Factory.escalation wrong");
console.assert(await factoryContract.collisionDetector() === CD_ADDRESS, "Factory.collisionDetector wrong");
```
