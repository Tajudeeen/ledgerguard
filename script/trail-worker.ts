/**
 * Trail worker: keeps the verifiable agent-risk history alive.
 *
 * Two modes:
 *   npx tsx script/trail-worker.ts attest    # attest the standard mint now
 *   npx tsx script/trail-worker.ts backfill  # replay recent history at intervals
 *   npx tsx script/trail-worker.ts run       # backfill, then loop forever
 *
 * "Standard mint" is 500 FXRP: the same amount every time, so the trail
 * isolates agent *movement* rather than mint-size noise. Each attestation is a
 * dated, re-verifiable point. Over hours/days this becomes the only public,
 * replayable record of how FXRP agents actually behaved.
 *
 * Cost: one non-payable tx per attestation (~0 gas in C2FLR, but dust for gas
 * accounting). A backfill of N points = N txs. Keep N modest.
 */
import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flareTestnet } from "viem/chains";

import { ATTESTATION_ABI } from "../lib/attestation/abi";
import { buildSnapshotCommitment } from "../lib/attestation/snapshot-hash";
import { readFxrpAgentSnapshots } from "../lib/fassets/fxrp-agent-reader";
import { rankAgents } from "../lib/scoring/rank-agents";
import { saveReceipt } from "../lib/utils/receipt-store";

const RPC = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";
const CONTRACT = process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS;
const KEY = process.env.DEPLOYER_PRIVATE_KEY;
const STANDARD_MINT_FXRP = 500n;
const BLOCKS_PER_POINT = 5_000n; // ~ a few minutes on Coston2 (~2.5s blocks)
const LIVE_INTERVAL_MS = 5 * 60 * 1000; // attest every 5 minutes in run mode
const BACKFILL_POINTS = 12;

if (!CONTRACT) {
  console.error("NEXT_PUBLIC_ATTESTATION_ADDRESS is not set");
  process.exit(1);
}
if (!KEY) {
  console.error("DEPLOYER_PRIVATE_KEY is not set");
  process.exit(1);
}

const account = privateKeyToAccount(KEY as `0x${string}`);
const CONTRACT_ADDR = CONTRACT as `0x${string}`;
const publicClient = createPublicClient({ chain: flareTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: flareTestnet, transport: http(RPC) });

async function attestAt(blockNumber?: bigint) {
  const state = await readFxrpAgentSnapshots(blockNumber);
  const ranking = rankAgents(state, STANDARD_MINT_FXRP * state.assetUnitUBA);
  const commitment = buildSnapshotCommitment(ranking);

  const data = encodeFunctionData({
    abi: ATTESTATION_ABI,
    functionName: "attest",
    args: [
      commitment.snapshotHash,
      commitment.blockNumber,
      commitment.agentCount,
      commitment.mintAmountUBA,
      (ranking.recommended?.snapshot.agentVault ??
        "0x0000000000000000000000000000000000000000"),
    ],
  });

  const tx = await wallet.sendTransaction({ to: CONTRACT_ADDR, data });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error("attest reverted");

  const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACT_ADDR.toLowerCase());
  const id = log?.topics[1] ? BigInt(log.topics[1]).toString() : "0";

  // Cache the ranking so /trail and /agent/[vault] can reconstruct the point.
  const { toRankingView } = await import("../lib/utils/view");
  const view = toRankingView(ranking);
  await saveReceipt({ id, txHash: tx, view, storedAt: Date.now() });

  console.log(
    `attested id=${id} block=${commitment.blockNumber} rec=${ranking.recommended?.snapshot.agentVault ?? "none"} hash=${commitment.snapshotHash.slice(0, 18)}…`,
  );
  return id;
}

async function backfill() {
  const head = await publicClient.getBlockNumber();
  for (let i = BACKFILL_POINTS; i >= 1; i--) {
    const at = head - BLOCKS_PER_POINT * BigInt(i);
    try {
      await attestAt(at);
    } catch (e) {
      console.warn(`backfill point ${i} failed: ${(e as Error).message}`);
    }
  }
}

/**
 * Repairs the local receipt cache so /verdict/[id] and the per-agent trail
 * never 404 for an attestation that provably exists on-chain. The on-chain
 * RankingAttestation is the durable ledger; the local .receipts cache is
 * ephemeral (wiped on host restart / not committed to git). For every id that
 * has a contract record but no local cache file, we re-anchor the contract's
 * own data as a cached receipt.
 *
 * The cached ranking is only partially reconstructible from the on-chain
 * record (hash/block/mint/agent are on-chain; the full per-agent rows are
 * not), so repair writes a minimal-but-honest receipt: the verifiable fields
 * are filled from the contract, and `view` is left null so the verdict page
 * renders the on-chain proof and clearly states the agent table is not
 * cached. When the worker later re-attests at that block it upgrades the
 * receipt with the full ranking.
 */
async function repairCache() {
  const { readAttestationRecords } = await import("../lib/attestation/trail");
  const { existsReceipt, saveReceipt } = await import("../lib/utils/receipt-store");
  const { ATTESTATION_ABI } = await import("../lib/attestation/abi");

  const client = createPublicClient({ chain: flareTestnet, transport: http(RPC) });
  const records = await readAttestationRecords(
    client as unknown as { readContract: (a: Record<string, unknown>) => Promise<unknown> },
    CONTRACT_ADDR,
    ATTESTATION_ABI,
  );

  let repaired = 0;
  let ok = 0;
  for (const rec of records) {
    const id = String(rec.id);
    if (await existsReceipt(id)) {
      ok += 1;
      continue;
    }
    // Minimal honest receipt: verifiable fields from the contract, no fabricated
    // agent rows. The verdict page reads this and degrades the table gracefully.
    await saveReceipt({
      id,
      txHash: "", // not recoverable from the contract; verdict page links the event instead
      view: null,
      storedAt: rec.attestedAtMs,
    });
    repaired += 1;
  }
  console.log(`cache repair: ${ok} present, ${repaired} repaired of ${records.length} on-chain`);
}

const mode = process.argv[2] ?? "run";
if (mode === "attest") {
  await attestAt();
} else if (mode === "repair") {
  // Repair the local receipt cache from the on-chain ledger (no tx needed).
  await repairCache();
} else if (mode === "backfill") {
  await backfill();
} else if (mode === "run") {
  // Always repair first so a restarted host never serves a 404 for an
  // attestation that exists on-chain, then keep attesting new points.
  await repairCache();
  await backfill();
  for (;;) {
    await new Promise((r) => setTimeout(r, LIVE_INTERVAL_MS));
    try {
      await attestAt();
    } catch (e) {
      console.warn(`live attest failed: ${(e as Error).message}`);
    }
  }
} else {
  console.error("usage: trail-worker.mjs [attest|repair|backfill|run]");
  process.exit(1);
}
