"use client";

import { initFhevm, createInstance, type FhevmInstance } from "fhevmjs";

const KMS_CONTRACT_ADDRESS = "0x9D6891A6240D6130c54ae243d8005063D05fE14b";
const ACL_CONTRACT_ADDRESS = "0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e0";
const GATEWAY_URL = "https://gateway.sepolia.zama.ai/";

let instance: FhevmInstance | null = null;

export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (instance) return instance;

  await initFhevm();

  instance = await createInstance({
    kmsContractAddress: KMS_CONTRACT_ADDRESS,
    aclContractAddress: ACL_CONTRACT_ADDRESS,
    networkUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.sepolia.org",
    gatewayUrl: GATEWAY_URL,
  });

  return instance;
}

export interface BidData {
  price: bigint;
  deliveryYears: number;
  pastProjects: number;
  bondAmount: bigint;
}

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

  const encrypted = await input.encrypt();

  return encrypted;
}

export function resetFhevmInstance() {
  instance = null;
}
