import type { AgentSnapshot } from "../types/agent";

/**
 * Stress testing the recommendation without an oracle.
 *
 * LedgerGuard's core projection already isolates the effect of *your mint* at a
 * constant asset price (see headroom.ts: `CR_after = CR_before * backed/(backed+mint)`,
 * an identity that holds price constant so no oracle is needed).
 *
 * A *price shock* is a second, independent lever: if the collateral asset loses
 * value, every collateral ratio scales with it. Because CR = collateralValue /
 * mintedValue, a fractional drop `s` in collateral value multiplies the ratio
 * by `(1 - s)`. So the post-mint ratio under a price shock is:
 *
 *     CR_after_shock = CR_after_constant * (1 - s)
 *
 * This is a deterministic sensitivity analysis on data LedgerGuard already
 * reads from chain - no live price feed required, so it works identically on
 * testnet and mainnet and is fully reproducible. It answers the question the
 * fee-spread demo can't on a homogeneous testnet:
 *
 *     "If XRP drops 30% tomorrow, which agent still has headroom?"
 */

/** One basis point. */
const ONE_BIP = 10_000n;

/**
 * Apply a fractional price shock to a collateral ratio expressed in BIPS.
 * `shockBips` is signed: negative = price drop, positive = price rise.
 * e.g. applyShock(20000n, -3000n) => 20000 * (1 - 0.30) = 14000 BIPS.
 *
 * Clamped at zero (a ratio cannot go negative); a deeper-than-100% drop floors
 * at 0, which is correctly interpreted downstream as "breached liquidation".
 */
export function applyShock(ratioBIPS: bigint, shockBips: number): bigint {
  if (ratioBIPS <= 0n) return ratioBIPS;
  // shockBips is signed: -3000 means "price drops 30%", so the ratio is
  // multiplied by (1 - 0.30) = 0.70. Expressed in BIPS: ONE_BIP + shockBips.
  const factor = ONE_BIP + BigInt(Math.round(shockBips));
  if (factor <= 0n) return 0n;
  // ratio * factor / 1e4, rounded.
  return (ratioBIPS * factor) / ONE_BIP;
}

/**
 * Returns a shallow copy of the snapshot with vault and pool collateral ratios
 * stressed by `shockBips`. Non-ratio fields are untouched, so capacity/fee/eligibility
 * logic downstream still operates on real chain data.
 */
export function stressSnapshot(snap: AgentSnapshot, shockBips: number): AgentSnapshot {
  if (shockBips === 0) return snap;
  return {
    ...snap,
    vaultCollateralRatioBIPS: applyShock(snap.vaultCollateralRatioBIPS, shockBips),
    poolCollateralRatioBIPS: applyShock(snap.poolCollateralRatioBIPS, shockBips),
  };
}

/** Human-readable shock label, e.g. -3000 => "-30%". */
export function formatShock(shockBips: number): string {
  const pct = shockBips / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}
