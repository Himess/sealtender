"use client";

import {
  initSDK,
  createInstance,
  SepoliaConfig,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/bundle";

let instance: FhevmInstance | null = null;
let initPromise: Promise<FhevmInstance> | null = null;

/**
 * Returns a singleton FhevmInstance configured for Zama on Sepolia.
 *
 * Uses the canonical {@link SepoliaConfig} from `@zama-fhe/relayer-sdk`, which
 * auto-resolves the current Zama protocol addresses (ACL, KMS, InputVerifier,
 * Relayer URL, gateway chain id) for chainId 11155111. This avoids the
 * stale-address footgun that plagued the legacy `fhevmjs` setup.
 *
 * The wallet provider (window.ethereum) is preferred when available so the
 * relayer can EIP-712-sign requests; otherwise we fall back to a public RPC.
 */
export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initSDK();

    const network: string | unknown =
      typeof window !== "undefined" &&
      (window as unknown as { ethereum?: unknown }).ethereum
        ? (window as unknown as { ethereum: unknown }).ethereum
        : process.env.NEXT_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

    const created = await createInstance({
      ...SepoliaConfig,
      network: network as SepoliaConfigNetwork,
    });

    instance = created;
    return created;
  })();

  return initPromise;
}

type SepoliaConfigNetwork = Parameters<typeof createInstance>[0]["network"];

export interface BidData {
  price: bigint;
  deliveryYears: number;
  pastProjects: number;
  bondAmount: bigint;
}

/**
 * Encrypts the four bid components into a single ZK proof bundle bound to
 * `(contractAddress, userAddress)`. The order MUST match the on-chain
 * verifying call: price (euint64) → deliveryYears (euint32) →
 * pastProjects (euint32) → bondAmount (euint64).
 */
export async function encryptBidData(
  bidData: BidData,
  contractAddress: `0x${string}`,
  userAddress: `0x${string}`
) {
  const fhevmInstance = await getFhevmInstance();

  const input = fhevmInstance.createEncryptedInput(
    contractAddress,
    userAddress
  );

  input.add64(bidData.price);
  input.add32(bidData.deliveryYears);
  input.add32(bidData.pastProjects);
  input.add64(bidData.bondAmount);

  return input.encrypt();
}

export function resetFhevmInstance() {
  instance = null;
  initPromise = null;
}
