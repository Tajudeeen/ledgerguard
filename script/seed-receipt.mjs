
import { readFxrpAgentSnapshots } from "../lib/fassets/fxrp-agent-reader";
import { rankAgents } from "../lib/scoring/rank-agents";
import { toRankingView } from "../lib/utils/view";
import { mkdir, writeFile } from "node:fs/promises";

const block = BigInt(process.argv[2]);
const amount = BigInt(process.argv[3]);
const txHash = process.argv[4];
const id = process.argv[5];

const state = await readFxrpAgentSnapshots(block);
const ranking = rankAgents(state, amount * state.assetUnitUBA);
const view = toRankingView(ranking);
await mkdir(".receipts", { recursive: true });
await writeFile(`.receipts/${id}.json`, JSON.stringify({ id, txHash, view, storedAt: Date.now() }));
console.log("seeded", id, "hash", view.snapshotHash);
