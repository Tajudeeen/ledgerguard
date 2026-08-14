/**
 * Independently reproduces a LedgerGuard snapshot hash from chain state.
 *
 *   npx tsx script/reproduce.ts <blockNumber> <mintAmountFxrp> [attestationId]
 *
 * Re-reads the FXRP AssetManager at the given block, re-runs the scoring
 * engine, prints the hash, and - when an attestation id is supplied - reads
 * that attestation back from Coston2 and reports whether the two agree.
 *
 * Note: reading a historical block requires an archive RPC. Set COSTON2_RPC_URL
 * to one if the public endpoint has pruned the block you are checking.
 */
import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

import { ATTESTATION_ABI } from "../lib/attestation/abi";
import { buildSnapshotCommitment } from "../lib/attestation/snapshot-hash";
import { readFxrpAgentSnapshots } from "../lib/fassets/fxrp-agent-reader";
import { rankAgents } from "../lib/scoring/rank-agents";

const [blockArg, amountArg, attestationId] = process.argv.slice(2);

if (!blockArg || !amountArg) {
  console.error(
    "usage: npx tsx script/reproduce.ts <blockNumber> <mintAmountFxrp> [attestationId]",
  );
  process.exit(1);
}

const blockNumber = BigInt(blockArg);
const mintFxrp = BigInt(amountArg);

const state = await readFxrpAgentSnapshots(blockNumber);
const ranking = rankAgents(state, mintFxrp * state.assetUnitUBA);
const commitment = buildSnapshotCommitment(ranking);

console.log("block         :", state.blockNumber);
console.log("asset manager :", state.assetManager);
console.log("agents        :", commitment.agentCount);
console.log("mint (UBA)    :", commitment.mintAmountUBA);
console.log("recommended   :", ranking.recommended?.snapshot.agentVault ?? "none eligible");
console.log("snapshot hash :", commitment.snapshotHash);

if (attestationId !== undefined) {
  const address = process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS;
  if (!address) {
    console.error("\nNEXT_PUBLIC_ATTESTATION_ADDRESS is not set; cannot compare on-chain.");
    process.exit(1);
  }

  const client = createPublicClient({
    chain: flareTestnet,
    transport: http(process.env.COSTON2_RPC_URL),
  });
  const record = await client.readContract({
    address: address as `0x${string}`,
    abi: ATTESTATION_ABI,
    functionName: "get",
    args: [BigInt(attestationId)],
  });

  const match = record.snapshotHash.toLowerCase() === commitment.snapshotHash.toLowerCase();
  console.log("\non-chain hash :", record.snapshotHash);
  console.log("on-chain block:", record.snapshotBlock);
  console.log("submitter     :", record.submitter);
  console.log(match ? "\nMATCH - the anchored ranking reproduces exactly." : "\nMISMATCH");
  process.exit(match ? 0 : 1);
}
