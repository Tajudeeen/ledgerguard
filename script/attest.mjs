/**
 * End-to-end proof: rank a live Coston2 snapshot, anchor it on-chain via the
 * deployed RankingAttestation, and verify the contract record reproduces the
 * same hash.
 *
 *   set -a && . ./.env.local && set +a && node script/attest.mjs [amountFxrp]
 */
import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flareTestnet } from "viem/chains";

import { ATTESTATION_ABI } from "../lib/attestation/abi";
import { buildSnapshotCommitment } from "../lib/attestation/snapshot-hash";
import { readFxrpAgentSnapshots } from "../lib/fassets/fxrp-agent-reader";
import { rankAgents } from "../lib/scoring/rank-agents";

const RPC = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";
const CONTRACT = process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS;
const KEY = process.env.DEPLOYER_PRIVATE_KEY
const amountFxrp = BigInt(process.argv[2] ?? "500");

if (!CONTRACT) {
  console.error("NEXT_PUBLIC_ATTESTATION_ADDRESS is not set");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
const publicClient = createPublicClient({ chain: flareTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: flareTestnet, transport: http(RPC) });

const state = await readFxrpAgentSnapshots();
const ranking = rankAgents(state, amountFxrp * state.assetUnitUBA);
const commitment = buildSnapshotCommitment(ranking);

console.log("snapshot block :", commitment.blockNumber);
console.log("agents         :", commitment.agentCount);
console.log("mint (UBA)     :", commitment.mintAmountUBA);
console.log("recommended    :", ranking.recommended?.snapshot.agentVault ?? "none eligible");
console.log("snapshot hash  :", commitment.snapshotHash);
console.log("anchoring via  :", account.address);

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

const tx = await wallet.sendTransaction({ to: CONTRACT, data });
console.log("tx             :", tx);
const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== "success") {
  console.error("reverted");
  process.exit(1);
}

const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACT.toLowerCase());
const id = log?.topics[1] ? BigInt(log.topics[1]).toString() : "0";

const record = await publicClient.readContract({
  address: CONTRACT,
  abi: ATTESTATION_ABI,
  functionName: "get",
  args: [BigInt(id)],
});

const match = record.snapshotHash.toLowerCase() === commitment.snapshotHash.toLowerCase();
console.log("\non-chain id     :", id);
console.log("on-chain hash  :", record.snapshotHash);
console.log("on-chain block :", record.snapshotBlock);
console.log("submitter      :", record.submitter);
console.log("\n" + (match ? "VERIFIED — on-chain record reproduces the hash" : "MISMATCH"));

console.log("\nexplorer tx     : https://coston2.testnet.flarescan.com/tx/" + tx);
console.log("explorer addr  : https://coston2.testnet.flarescan.com/address/" + CONTRACT);
process.exit(match ? 0 : 1);
