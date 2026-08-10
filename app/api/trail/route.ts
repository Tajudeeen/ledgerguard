import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

import { ATTESTATION_ABI, ATTESTATION_ADDRESS } from "@/lib/attestation/abi";
import { buildTrails, readAttestationRecords, type AttestationRecord } from "@/lib/attestation/trail";
import { loadRankingView } from "@/lib/utils/receipt-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Returns the full verifiable trail: every attestation on the deployed
 * contract plus the per-agent time series and stability scores. The trail is
 * reconstructed from each attestation's cached ranking (written at attest
 * time). Each point is independently re-verifiable: take its snapshot block and
 * re-run script/reproduce.ts to confirm the cached ranking matches chain.
 */
export async function GET() {
  if (!ATTESTATION_ADDRESS) {
    return NextResponse.json({ error: "no attestation contract configured" }, { status: 409 });
  }

  try {
    const client = createPublicClient({ chain: flareTestnet, transport: http() });
    const records: AttestationRecord[] = await readAttestationRecords(
      client as unknown as { readContract: (args: Record<string, unknown>) => Promise<unknown> },
      ATTESTATION_ADDRESS,
      ATTESTATION_ABI,
    );

    const trails = await buildTrails(records, (id) => loadRankingView(String(id)));

    return NextResponse.json(
      {
        contract: ATTESTATION_ADDRESS,
        attestationCount: records.length,
        firstBlock: records[0]?.snapshotBlock ?? null,
        latestBlock: records[records.length - 1]?.snapshotBlock ?? null,
        agentsTracked: trails.length,
        trails,
        records,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "trail read failed" },
      { status: 502 },
    );
  }
}
