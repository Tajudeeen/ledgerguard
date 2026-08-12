import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

import { ATTESTATION_ABI, ATTESTATION_ADDRESS } from "./abi";
import type { AttestationRecord } from "./trail";

export type { AttestationRecord };

const ZERO_HASH = "0x" + "0".repeat(64);

/**
 * Reads a single attestation record directly from the deployed contract.
 *
 * Unlike the receipt cache (./receipt-store.ts), this never depends on
 * ephemeral local disk state, so it is the durable source of truth for
 * /verdict/[id]. When the local ranking cache has been wiped by a host
 * restart, the on-chain record still lets us render a real, verifiable
 * receipt instead of a 404.
 *
 * Returns null when the id is out of range or the contract is unconfigured.
 */
export async function readAttestationRecordById(
  id: number,
): Promise<AttestationRecord | null> {
  if (!ATTESTATION_ADDRESS) return null;
  if (!Number.isInteger(id) || id < 0) return null;

  try {
    const client = createPublicClient({
      chain: flareTestnet,
      transport: http(),
    });

    const count = Number(
      await client.readContract({
        address: ATTESTATION_ADDRESS as `0x${string}`,
        abi: ATTESTATION_ABI,
        functionName: "count",
        args: [],
      }),
    );
    if (id >= count) return null;

    const rec = (await client.readContract({
      address: ATTESTATION_ADDRESS as `0x${string}`,
      abi: ATTESTATION_ABI,
      functionName: "get",
      args: [BigInt(id)],
    })) as {
      snapshotHash: string;
      snapshotBlock: bigint;
      attestedAt: bigint;
      agentCount: number;
      mintAmountUBA: bigint;
      recommendedAgent: string;
      submitter: string;
    };

    // Defensive: an unwritten slot would decode to a zero hash.
    if (!rec.snapshotHash || rec.snapshotHash === ZERO_HASH) return null;

    return {
      id,
      snapshotHash: rec.snapshotHash,
      snapshotBlock: Number(rec.snapshotBlock),
      attestedAtMs: Number(rec.attestedAt) * 1000,
      agentCount: rec.agentCount,
      mintAmountUBA: rec.mintAmountUBA.toString(),
      recommendedAgent: rec.recommendedAgent,
      submitter: rec.submitter,
    };
  } catch {
    return null;
  }
}
