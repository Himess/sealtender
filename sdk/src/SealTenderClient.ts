/**
 * @module SealTenderClient
 * @description Main SDK client for interacting with the SealTender FHE-encrypted
 * procurement protocol. Wraps all contract interactions including FHE encryption,
 * tender lifecycle management, escrow, disputes, and registry operations.
 */

import { ethers } from "ethers";
import { initFhevm, createInstance, type FhevmInstance } from "fhevmjs";

import {
  TenderState,
  TenderConfig,
  BidInput,
  BidderProfile,
  Dispute,
  DisputeType,
  DisputeStatus,
  DepositStatus,
  ContractAddresses,
  CreateTenderResult,
  RevealResult,
  EscrowInfo,
} from "./types";

import {
  DEFAULT_ADDRESSES,
  KMS_CONTRACT_ADDRESS,
  ACL_CONTRACT_ADDRESS,
  GATEWAY_URL,
  FACTORY_ABI,
  TENDER_ABI,
  ESCROW_ABI,
  REGISTRY_ABI,
  DISPUTE_MANAGER_ABI,
  ESCALATION_ABI,
  COLLISION_DETECTOR_ABI,
  CUSDC_ABI,
} from "./constants";

import {
  parseTenderState,
  parseDisputeStatus,
  parseDisputeType,
  parseDepositStatus,
  materialIdToBytes32,
} from "./utils";

import {
  FHEEncryptionError,
  ContractCallError,
  TransactionError,
  ValidationError,
  WalletNotConnectedError,
} from "./errors";

/**
 * SealTenderClient provides a high-level TypeScript API for the SealTender protocol.
 *
 * @example
 * ```typescript
 * import { SealTenderClient } from "@sealtender/sdk";
 * import { ethers } from "ethers";
 *
 * const provider = new ethers.BrowserProvider(window.ethereum);
 * const signer = await provider.getSigner();
 *
 * const client = new SealTenderClient(signer, {
 *   factory: "0x...",
 *   escrow: "0x...",
 *   registry: "0x...",
 * });
 *
 * const { tenderId, tenderAddress } = await client.createTender({
 *   description: "Road Construction Phase 2",
 *   deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
 *   weightYears: 30,
 *   weightProjects: 30,
 *   weightBond: 40,
 *   minYears: 5,
 *   minProjects: 3,
 *   minBond: 100000n,
 *   escrowAmount: ethers.parseEther("0.1"),
 *   maxBidders: 10n,
 *   minReputation: 50n,
 * });
 * ```
 */
export class SealTenderClient {
  private signer: ethers.Signer;
  private addresses: ContractAddresses;
  private fhevmInstance: FhevmInstance | null = null;
  private fhevmInitialized = false;

  // Contract instances (lazily initialized)
  private factoryContract: ethers.Contract;
  private escrowContract: ethers.Contract;
  private registryContract: ethers.Contract;
  private disputeManagerContract: ethers.Contract;
  private escalationContract: ethers.Contract;
  private collisionDetectorContract: ethers.Contract;
  private cusdcContract: ethers.Contract;

  /**
   * Create a new SealTenderClient instance.
   *
   * @param signer - An ethers.js Signer connected to a provider
   * @param addresses - Optional partial contract addresses (merged with defaults)
   */
  constructor(
    signer: ethers.Signer,
    addresses?: Partial<ContractAddresses>
  ) {
    this.signer = signer;
    this.addresses = { ...DEFAULT_ADDRESSES, ...addresses };

    this.factoryContract = new ethers.Contract(
      this.addresses.factory,
      FACTORY_ABI,
      this.signer
    );
    this.escrowContract = new ethers.Contract(
      this.addresses.escrow,
      ESCROW_ABI,
      this.signer
    );
    this.registryContract = new ethers.Contract(
      this.addresses.registry,
      REGISTRY_ABI,
      this.signer
    );
    this.disputeManagerContract = new ethers.Contract(
      this.addresses.disputeManager,
      DISPUTE_MANAGER_ABI,
      this.signer
    );
    this.escalationContract = new ethers.Contract(
      this.addresses.escalation,
      ESCALATION_ABI,
      this.signer
    );
    this.collisionDetectorContract = new ethers.Contract(
      this.addresses.collisionDetector,
      COLLISION_DETECTOR_ABI,
      this.signer
    );
    this.cusdcContract = new ethers.Contract(
      this.addresses.cusdc,
      CUSDC_ABI,
      this.signer
    );
  }

  // ─── Retry Logic ────────────────────────────────────────────────────────

  /**
   * Retry wrapper for critical operations. Applies exponential backoff.
   *
   * @param fn - Async function to retry
   * @param retries - Number of retry attempts (default 3)
   * @param delay - Base delay between retries in ms (default 1000)
   * @returns Result of the function call
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
      }
    }
    throw new Error("Unreachable");
  }

  // ─── Event Listeners ──────────────────────────────────────────────────

  /**
   * Map of contract name to contract instance for event listening.
   */
  private getContract(contractName: string): ethers.Contract {
    const map: Record<string, ethers.Contract> = {
      factory: this.factoryContract,
      escrow: this.escrowContract,
      registry: this.registryContract,
      disputeManager: this.disputeManagerContract,
      escalation: this.escalationContract,
      collisionDetector: this.collisionDetectorContract,
      cusdc: this.cusdcContract,
    };

    const contract = map[contractName];
    if (!contract) {
      throw new ValidationError(
        `Unknown contract name: ${contractName}. Valid names: ${Object.keys(map).join(", ")}`,
        "contractName"
      );
    }
    return contract;
  }

  /**
   * Listen to contract events. For tender-specific events, use getTenderContract() first.
   *
   * @param contractName - One of: factory, escrow, registry, disputeManager, escalation, collisionDetector, cusdc
   * @param eventName - The event name to listen for
   * @param callback - Callback invoked when the event fires
   */
  async listenToEvents(
    contractName: string,
    eventName: string,
    callback: (...args: unknown[]) => void
  ): Promise<void> {
    const contract = this.getContract(contractName);
    contract.on(eventName, callback);
  }

  /**
   * Stop listening to a specific event on a contract.
   *
   * @param contractName - One of: factory, escrow, registry, disputeManager, escalation, collisionDetector, cusdc
   * @param eventName - The event name to stop listening for
   */
  async stopListening(
    contractName: string,
    eventName: string
  ): Promise<void> {
    const contract = this.getContract(contractName);
    contract.removeAllListeners(eventName);
  }

  // ─── FHE Initialization ─────────────────────────────────────────────────

  /**
   * Initialize the fhevmjs library. Called automatically before encryption.
   * Safe to call multiple times (idempotent).
   */
  private async initFhevm(): Promise<void> {
    if (this.fhevmInitialized) return;

    await initFhevm();

    const provider = this.signer.provider;
    if (!provider) {
      throw new WalletNotConnectedError();
    }

    const network = await provider.getNetwork();

    this.fhevmInstance = await createInstance({
      kmsContractAddress: KMS_CONTRACT_ADDRESS,
      aclContractAddress: ACL_CONTRACT_ADDRESS,
      networkUrl: network.name === "sepolia"
        ? "https://rpc.sepolia.org"
        : "http://localhost:8545",
      gatewayUrl: GATEWAY_URL,
    });

    this.fhevmInitialized = true;
  }

  /**
   * Encrypt bid data using fhevmjs for submission to an EncryptedTender contract.
   *
   * @param tenderAddress - The EncryptedTender contract address
   * @param bid - Plain-text bid data to encrypt
   * @returns Encrypted handles and input proof for contract call
   */
  private async encryptBid(
    tenderAddress: string,
    bid: BidInput
  ): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
    await this.initFhevm();

    if (!this.fhevmInstance) {
      throw new FHEEncryptionError("FHE instance not initialized");
    }

    const signerAddress = await this.signer.getAddress();

    try {
      const input = this.fhevmInstance.createEncryptedInput(
        tenderAddress as `0x${string}`,
        signerAddress as `0x${string}`
      );

      // Encrypt all 4 bid fields: price (uint64), years (uint32), projects (uint32), bond (uint64)
      input.add64(bid.price);
      input.add32(bid.yearsExperience);
      input.add32(bid.completedProjects);
      input.add64(bid.bondCapacity);

      const encrypted = await input.encrypt();

      return {
        handles: encrypted.handles,
        inputProof: encrypted.inputProof,
      };
    } catch (err) {
      if (err instanceof FHEEncryptionError) throw err;
      throw new FHEEncryptionError(
        err instanceof Error ? err.message : "Failed to encrypt bid data"
      );
    }
  }

  // ─── Tender Lifecycle ───────────────────────────────────────────────────

  /**
   * Create a new tender via the TenderFactory.
   * Only callable by the factory owner.
   *
   * @param config - Tender configuration
   * @returns The tender ID and deployed contract address
   */
  async createTender(config: TenderConfig): Promise<CreateTenderResult> {
    return this.withRetry(async () => {
      const configTuple = [
        config.description,
        config.deadline,
        config.weightYears,
        config.weightProjects,
        config.weightBond,
        config.minYears,
        config.minProjects,
        config.minBond,
        config.escrowAmount,
        config.maxBidders,
        config.minReputation,
      ];

      const tx = await this.factoryContract.createTender(configTuple);
      const receipt = await tx.wait();

      // Parse TenderCreated event
      const event = receipt.logs
        .map((log: ethers.Log) => {
          try {
            return this.factoryContract.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
          } catch {
            return null;
          }
        })
        .find((e: ethers.LogDescription | null) => e?.name === "TenderCreated");

      if (!event) {
        throw new ContractCallError(
          "TenderCreated event not found in transaction receipt",
          "TenderFactory",
          "createTender"
        );
      }

      return {
        tenderId: event.args[0],
        tenderAddress: event.args[1],
      };
    });
  }

  /**
   * Get the total number of tenders created.
   */
  async getTenderCount(): Promise<bigint> {
    return await this.factoryContract.getTenderCount();
  }

  /**
   * Get the deployed address for a tender by ID.
   *
   * @param tenderId - The tender ID (0-indexed)
   * @returns The EncryptedTender contract address
   */
  async getTenderAddress(tenderId: number): Promise<string> {
    return await this.factoryContract.tenderById(tenderId);
  }

  /**
   * Get the full configuration of a deployed tender.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @returns Parsed TenderConfig
   */
  async getTenderConfig(tenderAddress: string): Promise<TenderConfig> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const c = await tender.config();

    return {
      description: c[0],
      deadline: c[1],
      weightYears: Number(c[2]),
      weightProjects: Number(c[3]),
      weightBond: Number(c[4]),
      minYears: Number(c[5]),
      minProjects: Number(c[6]),
      minBond: c[7],
      escrowAmount: c[8],
      maxBidders: c[9],
      minReputation: c[10],
    };
  }

  /**
   * Get the current lifecycle state of a tender.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @returns Current TenderState
   */
  async getTenderState(tenderAddress: string): Promise<TenderState> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const stateNum = await tender.state();
    return parseTenderState(Number(stateNum));
  }

  /**
   * Get all tender addresses in a range.
   * Returns all tenders if no range is specified.
   *
   * @returns Array of EncryptedTender contract addresses
   */
  async getAllTenders(): Promise<string[]> {
    const count = await this.getTenderCount();
    if (count === 0n) return [];
    return await this.factoryContract.getTenders(0, count);
  }

  /**
   * Cancel a tender. Only callable by the tender owner.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   */
  async cancelTender(tenderAddress: string): Promise<void> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const tx = await tender.cancel();
    await tx.wait();
  }

  // ─── Bidding (FHE) ─────────────────────────────────────────────────────

  /**
   * Submit an encrypted bid to a tender.
   * Automatically handles FHE encryption of bid data.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param bid - Plain-text bid data (encrypted client-side before submission)
   * @returns Transaction hash
   */
  async submitBid(tenderAddress: string, bid: BidInput): Promise<string> {
    return this.withRetry(async () => {
      const { handles } = await this.encryptBid(tenderAddress, bid);

      const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
      const tx = await tender.submitBid(
        handles[0],  // encPrice
        handles[1],  // encYears
        handles[2],  // encProjects
        handles[3]   // encBond
      );

      const receipt = await tx.wait();
      return receipt.hash;
    });
  }

  /**
   * Update an existing bid with new encrypted data.
   * Only callable before the tender deadline.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param bid - Updated plain-text bid data
   * @returns Transaction hash
   */
  async updateBid(tenderAddress: string, bid: BidInput): Promise<string> {
    const { handles } = await this.encryptBid(tenderAddress, bid);

    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const tx = await tender.updateBid(
      handles[0],
      handles[1],
      handles[2],
      handles[3]
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get bid information for the current signer.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @returns Encrypted bid handles, version, and existence flag
   */
  async getMyBid(
    tenderAddress: string
  ): Promise<{
    encPrice: string;
    encYears: string;
    encProjects: string;
    encBond: string;
    version: bigint;
    exists: boolean;
  }> {
    const signerAddress = await this.signer.getAddress();
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const bid = await tender.bids(signerAddress);

    return {
      encPrice: bid[0],
      encYears: bid[1],
      encProjects: bid[2],
      encBond: bid[3],
      version: bid[4],
      exists: bid[5],
    };
  }

  /**
   * Get the number of bidders for a tender.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   */
  async getBidderCount(tenderAddress: string): Promise<bigint> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    return await tender.getBidderCount();
  }

  /**
   * Check if a specific address has submitted a bid.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param bidder - Address to check
   * @returns True if the address has an active bid
   */
  async hasBid(tenderAddress: string, bidder: string): Promise<boolean> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const bid = await tender.bids(bidder);
    return bid[5]; // exists field
  }

  /**
   * Get the list of bidder addresses for a tender.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param start - Start index (inclusive)
   * @param end - End index (exclusive)
   * @returns Array of bidder addresses
   */
  async getBidders(
    tenderAddress: string,
    start: number,
    end: number
  ): Promise<string[]> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    return await tender.getBidders(start, end);
  }

  // ─── Evaluation & Reveal ────────────────────────────────────────────────

  /**
   * Start the evaluation phase. Only callable after the deadline has passed.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   */
  async startEvaluation(tenderAddress: string): Promise<void> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const tx = await tender.startEvaluation();
    await tx.wait();
  }

  /**
   * Submit an evaluation score for a specific bidder.
   * Scores must be submitted in order (bidderIndex must equal evaluatedCount).
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param bidderIndex - Index of the bidder being scored
   * @param score - Computed score for this bidder
   */
  async submitScore(
    tenderAddress: string,
    bidderIndex: number,
    score: bigint
  ): Promise<void> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const tx = await tender.submitScore(bidderIndex, score);
    await tx.wait();
  }

  /**
   * Evaluate a batch of bidders sequentially.
   * Scores should be pre-computed off-chain via FHE decryption.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param startIdx - First bidder index to evaluate
   * @param endIdx - Last bidder index to evaluate (exclusive)
   * @param scores - Array of scores for each bidder in the range
   */
  async evaluateBatch(
    tenderAddress: string,
    startIdx: number,
    endIdx: number,
    scores: bigint[]
  ): Promise<void> {
    if (scores.length !== endIdx - startIdx) {
      throw new ValidationError(
        `Score count (${scores.length}) must match range (${endIdx - startIdx})`,
        "scores"
      );
    }

    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    for (let i = startIdx; i < endIdx; i++) {
      const tx = await tender.submitScore(i, scores[i - startIdx]);
      await tx.wait();
    }
  }

  /**
   * Evaluate all bidders in a tender.
   * Fetches bidder count and submits scores sequentially.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param scores - Array of scores for all bidders (length must match bidder count)
   */
  async evaluateAll(
    tenderAddress: string,
    scores: bigint[]
  ): Promise<void> {
    const count = await this.getBidderCount(tenderAddress);
    if (BigInt(scores.length) !== count) {
      throw new ValidationError(
        `Score count (${scores.length}) must match bidder count (${count})`,
        "scores"
      );
    }

    await this.evaluateBatch(tenderAddress, 0, scores.length, scores);
  }

  /**
   * Complete the evaluation phase. Requires all bidders to be scored.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   */
  async completeEvaluation(tenderAddress: string): Promise<void> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const tx = await tender.completeEvaluation();
    await tx.wait();
  }

  /**
   * Reveal the winner of a tender.
   * Can only be called in the Revealed state.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param winnerIndex - Index of the winning bidder
   * @param price - The winning bid price (decrypted off-chain)
   */
  async revealWinner(
    tenderAddress: string,
    winnerIndex: number,
    price: bigint
  ): Promise<void> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const tx = await tender.revealWinner(winnerIndex, price);
    await tx.wait();
  }

  /**
   * Get the winner information for a completed tender.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @returns Winner address and winning price
   */
  async getWinner(
    tenderAddress: string
  ): Promise<{ address: string; price: bigint }> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    const [winnerAddr, winnerPrice] = await Promise.all([
      tender.winner(),
      tender.winnerPrice(),
    ]);

    return {
      address: winnerAddr,
      price: winnerPrice,
    };
  }

  /**
   * Get the evaluation score for a specific bidder by index.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @param index - Bidder index
   * @returns The computed score
   */
  async getScore(tenderAddress: string, index: number): Promise<bigint> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    return await tender.getScore(index);
  }

  /**
   * Get the number of bidders that have been evaluated so far.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   */
  async getEvaluatedCount(tenderAddress: string): Promise<bigint> {
    const tender = new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
    return await tender.evaluatedCount();
  }

  // ─── Escrow ─────────────────────────────────────────────────────────────

  /**
   * Deposit ETH into escrow for a tender.
   *
   * @param tenderId - The tender ID
   * @param amount - Amount to deposit in wei
   */
  async deposit(tenderId: number, amount: bigint): Promise<void> {
    const tx = await this.escrowContract.deposit(tenderId, { value: amount });
    await tx.wait();
  }

  /**
   * Get the escrow deposit amount for a bidder.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address
   * @returns Deposit amount in wei
   */
  async getDeposit(tenderId: number, bidder: string): Promise<bigint> {
    return await this.escrowContract.getDeposit(tenderId, bidder);
  }

  /**
   * Get the deposit status for a bidder.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address
   * @returns Current DepositStatus
   */
  async getDepositStatus(
    tenderId: number,
    bidder: string
  ): Promise<DepositStatus> {
    const status = await this.escrowContract.getDepositStatus(tenderId, bidder);
    return parseDepositStatus(Number(status));
  }

  /**
   * Get full escrow information for a bidder.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address
   * @returns EscrowInfo with amount and status
   */
  async getEscrowInfo(tenderId: number, bidder: string): Promise<EscrowInfo> {
    const [amount, status] = await Promise.all([
      this.getDeposit(tenderId, bidder),
      this.getDepositStatus(tenderId, bidder),
    ]);
    return { amount, status };
  }

  /**
   * Release escrow deposit to a bidder. Only callable by authorized callers.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address to release funds to
   */
  async release(tenderId: number, bidder: string): Promise<void> {
    const tx = await this.escrowContract.release(tenderId, bidder);
    await tx.wait();
  }

  /**
   * Refund escrow deposit to a bidder. Only callable by authorized callers.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address to refund
   */
  async refund(tenderId: number, bidder: string): Promise<void> {
    const tx = await this.escrowContract.refund(tenderId, bidder);
    await tx.wait();
  }

  /**
   * Freeze a bidder's escrow deposit. Only callable by authorized callers.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address to freeze
   */
  async freeze(tenderId: number, bidder: string): Promise<void> {
    const tx = await this.escrowContract.freeze(tenderId, bidder);
    await tx.wait();
  }

  /**
   * Unfreeze a bidder's escrow deposit. Only callable by authorized callers.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address to unfreeze
   */
  async unfreeze(tenderId: number, bidder: string): Promise<void> {
    const tx = await this.escrowContract.unfreeze(tenderId, bidder);
    await tx.wait();
  }

  /**
   * Slash a bidder's escrow deposit. Sends funds to the recipient.
   *
   * @param tenderId - The tender ID
   * @param bidder - Bidder's address to slash
   * @param recipient - Address to receive the slashed funds
   */
  async slash(
    tenderId: number,
    bidder: string,
    recipient: string
  ): Promise<void> {
    const tx = await this.escrowContract.slash(tenderId, bidder, recipient);
    await tx.wait();
  }

  /**
   * Set the required deposit amount for a tender.
   *
   * @param tenderId - The tender ID
   * @param amount - Required deposit amount in wei
   */
  async setRequiredDeposit(tenderId: number, amount: bigint): Promise<void> {
    const tx = await this.escrowContract.setRequiredDeposit(tenderId, amount);
    await tx.wait();
  }

  /**
   * Get the required deposit amount for a tender.
   *
   * @param tenderId - The tender ID
   * @returns Required deposit amount in wei
   */
  async getRequiredDeposit(tenderId: number): Promise<bigint> {
    return await this.escrowContract.requiredDeposit(tenderId);
  }

  /**
   * Get total escrow held for a tender.
   *
   * @param tenderId - The tender ID
   * @returns Total escrow in wei
   */
  async getTotalEscrow(tenderId: number): Promise<bigint> {
    return await this.escrowContract.totalEscrow(tenderId);
  }

  // ─── Registry ───────────────────────────────────────────────────────────

  /**
   * Register a new bidder in the registry. Only callable by the registry owner.
   *
   * @param bidder - Address to register
   */
  async registerBidder(bidder: string): Promise<void> {
    const tx = await this.registryContract.registerBidder(bidder);
    await tx.wait();
  }

  /**
   * Remove a bidder from the registry. Only callable by the registry owner.
   *
   * @param bidder - Address to remove
   */
  async removeBidder(bidder: string): Promise<void> {
    const tx = await this.registryContract.removeBidder(bidder);
    await tx.wait();
  }

  /**
   * Check if a bidder is verified (KYC-passed).
   *
   * @param bidder - Address to check
   * @returns True if the bidder is verified
   */
  async isVerified(bidder: string): Promise<boolean> {
    return await this.registryContract.isVerified(bidder);
  }

  /**
   * Get the full on-chain profile of a bidder.
   *
   * @param bidder - Address to look up
   * @returns BidderProfile with all reputation metrics
   */
  async getProfile(bidder: string): Promise<BidderProfile> {
    const p = await this.registryContract.getProfile(bidder);
    return {
      verified: p[0],
      totalBids: p[1],
      totalWins: p[2],
      totalSlashes: p[3],
      completedOnTime: p[4],
      registeredAt: p[5],
    };
  }

  /**
   * Get the computed reputation score for a bidder.
   * Score ranges from 0-100. New bidders start at 50.
   *
   * @param bidder - Address to look up
   * @returns Reputation score (0-100)
   */
  async getReputationScore(bidder: string): Promise<bigint> {
    return await this.registryContract.getReputationScore(bidder);
  }

  /**
   * Get the total number of registered bidders.
   */
  async getBidderRegistryCount(): Promise<bigint> {
    return await this.registryContract.bidderCount();
  }

  /**
   * Add an authorized caller to the registry (e.g., a tender contract).
   *
   * @param caller - Address to authorize
   */
  async addAuthorizedCaller(caller: string): Promise<void> {
    const tx = await this.registryContract.addAuthorizedCaller(caller);
    await tx.wait();
  }

  /**
   * Remove an authorized caller from the registry.
   *
   * @param caller - Address to deauthorize
   */
  async removeAuthorizedCaller(caller: string): Promise<void> {
    const tx = await this.registryContract.removeAuthorizedCaller(caller);
    await tx.wait();
  }

  // ─── Disputes ───────────────────────────────────────────────────────────

  /**
   * File a company complaint against a bidder. Requires 0.01 ETH stake.
   * The stake is returned if the complaint is upheld; burned to municipality if dismissed.
   *
   * @param tenderId - The tender ID
   * @param accused - Address of the accused bidder
   * @param reason - Human-readable reason for the complaint
   * @returns Dispute ID
   */
  async fileCompanyComplaint(
    tenderId: number,
    accused: string,
    reason: string
  ): Promise<bigint> {
    const tx = await this.disputeManagerContract.fileCompanyComplaint(
      tenderId,
      accused,
      reason,
      { value: ethers.parseEther("0.01") }
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return this.disputeManagerContract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
        } catch {
          return null;
        }
      })
      .find((e: ethers.LogDescription | null) => e?.name === "DisputeFiled");

    if (!event) {
      throw new ContractCallError(
        "DisputeFiled event not found in transaction receipt",
        "DisputeManager",
        "fileCompanyComplaint"
      );
    }

    return event.args[0];
  }

  /**
   * File a citizen complaint against a bidder. No stake required.
   *
   * @param tenderId - The tender ID
   * @param accused - Address of the accused bidder
   * @param reason - Human-readable reason for the complaint
   * @returns Dispute ID
   */
  async fileCitizenComplaint(
    tenderId: number,
    accused: string,
    reason: string
  ): Promise<bigint> {
    const tx = await this.disputeManagerContract.fileCitizenComplaint(
      tenderId,
      accused,
      reason
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return this.disputeManagerContract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
        } catch {
          return null;
        }
      })
      .find((e: ethers.LogDescription | null) => e?.name === "DisputeFiled");

    if (!event) {
      throw new ContractCallError(
        "DisputeFiled event not found in transaction receipt",
        "DisputeManager",
        "fileCitizenComplaint"
      );
    }

    return event.args[0];
  }

  /**
   * Resolve a dispute. Only callable by the contract owner.
   *
   * @param disputeId - The dispute ID to resolve
   * @param resolution - Resolution status (Slashed, Dismissed, etc.)
   */
  async resolveDispute(
    disputeId: number,
    resolution: DisputeStatus
  ): Promise<void> {
    const tx = await this.disputeManagerContract.resolveDispute(
      disputeId,
      resolution
    );
    await tx.wait();
  }

  /**
   * Get the full details of a dispute.
   *
   * @param disputeId - The dispute ID
   * @returns Parsed Dispute object
   */
  async getDispute(disputeId: number): Promise<Dispute> {
    const d = await this.disputeManagerContract.getDispute(disputeId);
    return {
      complainant: d[0],
      accused: d[1],
      tenderId: d[2],
      disputeType: parseDisputeType(Number(d[3])),
      status: parseDisputeStatus(Number(d[4])),
      stake: d[5],
      reason: d[6],
    };
  }

  /**
   * Get all dispute IDs associated with a tender.
   *
   * @param tenderId - The tender ID
   * @returns Array of dispute IDs
   */
  async getDisputesByTender(tenderId: number): Promise<bigint[]> {
    return await this.disputeManagerContract.getDisputesByTender(tenderId);
  }

  /**
   * Get the total number of disputes filed.
   */
  async getDisputeCount(): Promise<bigint> {
    return await this.disputeManagerContract.disputeCount();
  }

  /**
   * Get the required complaint stake amount.
   * @returns 0.01 ETH in wei
   */
  async getComplaintStake(): Promise<bigint> {
    return await this.disputeManagerContract.COMPLAINT_STAKE();
  }

  // ─── Escalation ─────────────────────────────────────────────────────────

  /**
   * Set a price escalation rule for a material in a tender.
   *
   * @param tenderId - The tender ID
   * @param materialId - Human-readable material identifier (e.g., "STEEL_REBAR")
   * @param baselinePrice - Baseline price at contract time
   * @param thresholdPercent - Minimum price increase to trigger escalation (bps)
   * @param capPercent - Maximum allowed escalation (bps)
   * @param periodSeconds - Minimum time between evaluations
   */
  async setEscalationRule(
    tenderId: number,
    materialId: string,
    baselinePrice: bigint,
    thresholdPercent: bigint,
    capPercent: bigint,
    periodSeconds: bigint
  ): Promise<void> {
    const materialBytes32 = materialIdToBytes32(materialId);
    const tx = await this.escalationContract.setEscalationRule(
      tenderId,
      materialBytes32,
      baselinePrice,
      thresholdPercent,
      capPercent,
      periodSeconds
    );
    await tx.wait();
  }

  /**
   * Evaluate price escalation for a material. Returns the extra payment amount.
   *
   * @param tenderId - The tender ID
   * @param materialId - Human-readable material identifier
   * @returns Extra payment amount due to price escalation
   */
  async evaluateEscalation(
    tenderId: number,
    materialId: string
  ): Promise<bigint> {
    const materialBytes32 = materialIdToBytes32(materialId);
    const tx = await this.escalationContract.evaluateEscalation(
      tenderId,
      materialBytes32
    );
    const receipt = await tx.wait();

    // Parse return value from event
    const event = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return this.escalationContract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
        } catch {
          return null;
        }
      })
      .find(
        (e: ethers.LogDescription | null) => e?.name === "EscalationTriggered"
      );

    if (!event) {
      return 0n; // No escalation triggered
    }

    return event.args[2]; // extraPayment
  }

  /**
   * Update the oracle price for a material. Only callable by the contract owner.
   * Price changes are limited to 50% per update (sanity check).
   *
   * @param materialId - Human-readable material identifier
   * @param newPrice - New oracle price
   */
  async updateOraclePrice(
    materialId: string,
    newPrice: bigint
  ): Promise<void> {
    const materialBytes32 = materialIdToBytes32(materialId);
    const tx = await this.escalationContract.updateOraclePrice(
      materialBytes32,
      newPrice
    );
    await tx.wait();
  }

  /**
   * Set the total contract price for a tender (used in escalation calculations).
   *
   * @param tenderId - The tender ID
   * @param price - Total contract price
   */
  async setTenderPrice(tenderId: number, price: bigint): Promise<void> {
    const tx = await this.escalationContract.setTenderPrice(tenderId, price);
    await tx.wait();
  }

  /**
   * Get the baseline price for a material in a tender.
   */
  async getBaselinePrice(
    tenderId: number,
    materialId: string
  ): Promise<bigint> {
    const materialBytes32 = materialIdToBytes32(materialId);
    return await this.escalationContract.getBaselinePrice(
      tenderId,
      materialBytes32
    );
  }

  /**
   * Get the latest oracle price for a material.
   */
  async getLatestPrice(materialId: string): Promise<bigint> {
    const materialBytes32 = materialIdToBytes32(materialId);
    return await this.escalationContract.getLatestPrice(materialBytes32);
  }

  /**
   * Get the total escalation paid for a tender.
   */
  async getTotalEscalation(tenderId: number): Promise<bigint> {
    return await this.escalationContract.getTotalEscalation(tenderId);
  }

  // ─── Collision Detection ────────────────────────────────────────────────

  /**
   * Check if a collision check has been performed for a tender.
   *
   * @param tenderId - The tender ID
   * @returns True if collision has been checked
   */
  async isCollisionChecked(tenderId: number): Promise<boolean> {
    return await this.collisionDetectorContract.collisionChecked(tenderId);
  }

  /**
   * Get the collision detection result for a tender.
   *
   * @param tenderId - The tender ID
   * @returns True if a price collision was detected
   */
  async isCollisionDetected(tenderId: number): Promise<boolean> {
    return await this.collisionDetectorContract.collisionDetected(tenderId);
  }

  // ─── cUSDC Token ────────────────────────────────────────────────────────

  /**
   * Mint cUSDC tokens. Only callable by the token owner (testnet faucet).
   *
   * @param to - Recipient address
   * @param amount - Amount to mint (raw, 6 decimals)
   */
  async mintCUSDC(to: string, amount: number): Promise<void> {
    const rawAmount = BigInt(amount) * 1_000_000n;
    const tx = await this.cusdcContract.mint(to, rawAmount);
    await tx.wait();
  }

  /**
   * Mint cUSDC to the caller's own address (convenience faucet method).
   *
   * @param amount - Amount in human-readable USDC (e.g., 1000 = 1000 USDC)
   */
  async faucetCUSDC(amount: number): Promise<void> {
    const signerAddress = await this.signer.getAddress();
    await this.mintCUSDC(signerAddress, amount);
  }

  /**
   * Get the cUSDC balance of an address.
   *
   * @param address - Address to check
   * @returns Raw balance (6 decimals)
   */
  async getCUSDCBalance(address: string): Promise<bigint> {
    return await this.cusdcContract.balanceOf(address);
  }

  /**
   * Approve a spender for cUSDC tokens.
   *
   * @param spender - Address to approve
   * @param amount - Raw amount to approve (6 decimals)
   */
  async approveCUSDC(spender: string, amount: bigint): Promise<void> {
    const tx = await this.cusdcContract.approve(spender, amount);
    await tx.wait();
  }

  // ─── Utility Getters ────────────────────────────────────────────────────

  /**
   * Get the current signer's address.
   */
  async getSignerAddress(): Promise<string> {
    return await this.signer.getAddress();
  }

  /**
   * Get the contract addresses being used by this client.
   */
  getAddresses(): ContractAddresses {
    return { ...this.addresses };
  }

  /**
   * Create a new contract instance for a specific tender.
   * Useful for listening to events on a specific tender.
   *
   * @param tenderAddress - Address of the EncryptedTender contract
   * @returns ethers.Contract instance
   */
  getTenderContract(tenderAddress: string): ethers.Contract {
    return new ethers.Contract(tenderAddress, TENDER_ABI, this.signer);
  }
}
