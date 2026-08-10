import { NextResponse } from "next/server";

import { readFxrpAgentSnapshots } from "@/lib/fassets/fxrp-agent-reader";
import { readXrpUsdOracle } from "@/lib/flare/ftso";
import { rankAgents } from "@/lib/scoring/rank-agents";
import { stressSnapshot } from "@/lib/scoring/stress";
import { toRankingView } from "@/lib/utils/view";

/** Always hit the chain; a cached ranking would be a stale risk claim. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("amount") ?? "500";
  // `shock` is a what-if price shock in basis points (negative = price drop).
  // It is applied to the on-chain ratios for sensitivity analysis only and is
  // NOT part of the anchored ranking.
  const rawShock = searchParams.get("shock");

  let mintFxrp: bigint;
  try {
    mintFxrp = BigInt(raw);
  } catch {
    return NextResponse.json({ error: "amount must be a whole number of FXRP" }, { status: 400 });
  }
  if (mintFxrp <= 0n) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }
  if (mintFxrp > 100_000_000n) {
    return NextResponse.json({ error: "amount is unreasonably large" }, { status: 400 });
  }

  let shockBips = 0;
  if (rawShock !== null) {
    const parsed = Number(rawShock);
    if (!Number.isFinite(parsed) || parsed < -10_000 || parsed > 10_000) {
      return NextResponse.json({ error: "shock must be between -100% and +100%" }, { status: 400 });
    }
    shockBips = Math.round(parsed);
  }

  try {
    const state = await readFxrpAgentSnapshots();
    const stressed = shockBips === 0
      ? state
      : {
          ...state,
          snapshots: state.snapshots.map((s) => stressSnapshot(s, shockBips)),
        };
    const ranking = rankAgents(stressed, mintFxrp * state.assetUnitUBA);
    const view = toRankingView(ranking);

    // The live oracle read is informational; never blocks the ranking.
    const oracle = await readXrpUsdOracle(state.blockNumber).catch(() => null);

    return NextResponse.json(
      { ...view, whatIfShockBips: shockBips, oracle },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("rank failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read Coston2" },
      { status: 502 },
    );
  }
}
