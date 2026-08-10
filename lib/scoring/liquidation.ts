import type { AgentView } from "../utils/view";

/**
 * Liquidation price-move: how far the collateral asset (XRP) can fall before
 * this agent breaches its binding-leg liquidation threshold.
 *
 * A collateral ratio scales linearly with the collateral asset's price, so a
 * fractional price drop `s` multiplies the ratio by `(1 + s)` (see stress.ts).
 * The agent liquidates when:
 *
 *     currentRatio * (1 + s) = liquidationThreshold
 *  => s = liquidationThreshold / currentRatio - 1
 *
 * Expressed as signed BIPS (negative = price must fall):
 *
 *     moveBIPS = -((currentBIPS - liqBIPS) * 10000) / currentBIPS
 *
 * Example: current 2.00x (20000), liq 1.50x (15000) -> move = -2500 BIPS = -25%.
 * The agent survives a 25% XRP drawdown, then breaches.
 *
 * This is exact and needs no oracle: it is derived entirely from on-chain
 * ratios. FTSO's role is to *anchor the current price* so the move can be
 * expressed as an absolute dollar target ("liquidates if XRP < $Y"), but the
 * percentage is computable regardless of whether the feed is served.
 */
export function liquidationMoveBips(agent: {
  bindingLeg: { currentRatioBIPS: string | bigint; liquidationThresholdBIPS: string | bigint };
}): bigint {
  const current = BigInt(agent.bindingLeg.currentRatioBIPS || "0");
  const liq = BigInt(agent.bindingLeg.liquidationThresholdBIPS || "0");
  if (current <= 0n) return 0n;
  if (liq >= current) {
    // Already at or below liquidation: any further drop breaches.
    return 0n;
  }
  // negative: price must fall by this many BIPS.
  return -((current - liq) * 10_000n) / current;
}

/** Liquidation move as a signed percentage string, e.g. "-25.0%". */
export function formatMove(bips: bigint): string {
  const pct = Number(bips) / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Dollar price at which this agent liquidates, given the current XRP price. */
export function liquidationPriceUsd(
  agent: { bindingLeg: { currentRatioBIPS: string | bigint; liquidationThresholdBIPS: string | bigint } },
  currentXrpUsd: number | null,
): number | null {
  if (currentXrpUsd === null || currentXrpUsd <= 0) return null;
  const move = liquidationMoveBips(agent);
  // price * (1 + move/10000)
  return currentXrpUsd * (1 + Number(move) / 10_000);
}

/**
 * Sorts agent views by robustness under a price crash: the agent that can
 * absorb the deepest drawdown ranks first. Ties broken by projected headroom.
 */
export function byRobustness(agents: AgentView[]): AgentView[] {
  return [...agents].sort((a, b) => {
    const ma = liquidationMoveBips(a);
    const mb = liquidationMoveBips(b);
    // More negative move = can survive a deeper drawdown = safer = first.
    if (ma !== mb) return ma < mb ? -1 : 1;
    const ha = BigInt(a.bindingLeg.projectedHeadroomBIPS ?? "0");
    const hb = BigInt(b.bindingLeg.projectedHeadroomBIPS ?? "0");
    return hb > ha ? -1 : ha > hb ? 1 : 0;
  });
}
