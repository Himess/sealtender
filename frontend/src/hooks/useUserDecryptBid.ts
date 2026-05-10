"use client";

// User-decryption hook for a bidder's own encrypted bid.
//
// Why this exists: SealTender keeps every bid (price, years, projects, bond)
// in encrypted ciphertext form so observers cannot read it. But the
// *bidder* should be able to read their OWN bid -- that's the whole point
// of "self-sovereign data" beyond just sealed-bid auctions. Zama's relayer
// SDK exposes `userDecrypt` which combines (a) the bidder's EIP-712
// signature on a typed-data domain bound to the contract address and
// (b) the KMS threshold quorum's re-encryption of each ciphertext under
// an ephemeral keypair the bidder generates client-side. The relayer
// never sees plaintext -- only the bidder's wallet decrypts the final
// re-encryption.
//
// ACL prerequisite: the contract must have called `FHE.allow(handle, bidder)`
// on every handle the bidder wants to read. SealTender's submitBid does
// exactly this (see EncryptedTender.sol around lines 252-256), so each of
// the four BidData handles carries an ACL grant for the original submitter.
import { useCallback, useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { getFhevmInstance } from "@/lib/fhevm";
import { ADDRESSES, EncryptedTenderABI } from "@/lib/contracts";

export interface DecryptedBid {
  price: bigint;
  years: bigint;
  projects: bigint;
  bond: bigint;
  // Raw timestamps from the contract for completeness.
  timestamp: bigint;
  version: bigint;
}

/**
 * Pulls the four encrypted handles of msg.sender's bid on `tenderAddress`,
 * runs the EIP-712 + relayer userDecrypt round-trip, and returns plaintext
 * bid values. Throws if the wallet isn't connected or if any handle is
 * uninitialized (`bytes32(0)` -- meaning the bidder never submitted).
 */
export function useUserDecryptBid() {
  const { address: userAddress, isConnected } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decryptMyBid = useCallback(
    async (tenderAddress: `0x${string}`): Promise<DecryptedBid | null> => {
      if (!isConnected || !userAddress) {
        setError("Connect a wallet first");
        return null;
      }
      if (typeof window === "undefined" || !(window as any).ethereum) {
        setError("No injected wallet provider available");
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const fhevm = await getFhevmInstance();

        // Build an ethers BrowserProvider wrapping the wallet so we can
        // call signer.signTypedData. wagmi's useSignTypedData would also
        // work but BrowserProvider keeps this hook self-contained.
        const ethereum = (window as any).ethereum as ethers.Eip1193Provider;
        const browserProvider = new ethers.BrowserProvider(ethereum);
        const signer = await browserProvider.getSigner();

        // 1. Pull the four encrypted handles via getMyBid() -- the contract
        //    returns them as bytes32 (typechain types them as `string`).
        const tenderRO = new ethers.Contract(
          tenderAddress,
          EncryptedTenderABI,
          browserProvider
        );
        // We have to call getMyBid from the bidder's own signer because it
        // returns msg.sender's bid, not an arbitrary address's. Connect the
        // contract to the signer to set msg.sender = userAddress.
        const tenderAsBidder = tenderRO.connect(signer) as ethers.Contract;
        const [encPrice, encYears, encProjects, encBond, ts, version] =
          await tenderAsBidder.getMyBid.staticCall();

        const handlesHex: `0x${string}`[] = [
          encPrice as `0x${string}`,
          encYears as `0x${string}`,
          encProjects as `0x${string}`,
          encBond as `0x${string}`,
        ];
        if (handlesHex.some((h) => !h || h === ethers.ZeroHash)) {
          setError("No bid submitted by this wallet on this tender");
          return null;
        }

        // 2. Ephemeral keypair the relayer will re-encrypt to.
        const keypair = fhevm.generateKeypair();

        // 3. EIP-712 typed-data binding the request to (contract, time window).
        const contractAddresses: `0x${string}`[] = [tenderAddress];
        const startTimestamp = Math.floor(Date.now() / 1000);
        const durationDays = 1; // 24 h is plenty for a one-shot reveal

        const eip712 = fhevm.createEIP712(
          keypair.publicKey,
          contractAddresses,
          startTimestamp,
          durationDays
        );

        // ethers v6 signTypedData expects a mutable TypedDataField[]; the
        // SDK's .types are `readonly` -- spread to satisfy the cast.
        const signature = await signer.signTypedData(
          eip712.domain,
          {
            UserDecryptRequestVerification: [
              ...eip712.types.UserDecryptRequestVerification,
            ],
          },
          eip712.message
        );

        // 4. Submit to the relayer. It validates the EIP-712, asks the KMS
        //    threshold to re-encrypt each handle to keypair.publicKey, and
        //    returns a map keyed by 0x-prefixed bytes32 hex.
        const resultMap = await fhevm.userDecrypt(
          handlesHex.map((h) => ({ handle: h, contractAddress: tenderAddress })),
          keypair.privateKey,
          keypair.publicKey,
          signature.slice(2), // strip leading 0x for the relayer
          contractAddresses,
          userAddress as `0x${string}`,
          startTimestamp,
          durationDays
        );

        // 5. Pull plaintext per handle. Result is keyed by the same hex
        //    representation we used above.
        return {
          price: resultMap[handlesHex[0]] as bigint,
          years: resultMap[handlesHex[1]] as bigint,
          projects: resultMap[handlesHex[2]] as bigint,
          bond: resultMap[handlesHex[3]] as bigint,
          timestamp: ts as bigint,
          version: version as bigint,
        };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || String(e);
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, userAddress]
  );

  return { decryptMyBid, loading, error };
}
