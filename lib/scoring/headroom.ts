import type { AgentSnapshot } from "../types/agent";

/** Protocol convention: 10_000 BIPS = 100% = 1.00x. */
export const BIPS = 10_000n;

/** Fixed-point scale for internal ratio math (kept in BIPS, so 1 unit = 0.01%). */
export const RATIO_SCALE = BIPS;

/**
 * Total FXRP exposure an agent is currently backing.
 *
 * All three components consume collateral: `mintedUBA` is live backing,
 * `reservedUBA` is collateral locked by an in-flight collateral reservation,
 * and `redeemingUBA` is still backed until the redemption is confirmed.
 * Ignoring reserved/redeeming would understate the agent's real load and make
 * a busy agent look safer than it is.
 */
export function backedUBA(agent: AgentSnapshot): bigint {
  return agent.mintedUBA + agent.reservedUBA + agent.redeemingUBA;
}

/**
 * Projects a collateral ratio forward through a mint of `mintAmountUBA`.
 *
 * A mint does not change the agent's collateral; it only increases the value
 * of the asset that collateral must back. Collateral ratio is
 *
 *     CR = collateralValue / backedValue
 *
 * so for a constant collateral value and a constant asset price the ratio
 * scales exactly inversely with the backed amount:
 *
 *     CR_after = CR_before * backedBefore / (backedBefore + mintAmount)
 *
 * This is an identity, not an approximation: the unknown collateral value and
 * the unknown asset price cancel. LedgerGuard therefore needs no price oracle
 * to project the post-mint ratio, and the projection cannot drift because of a
 * stale price feed. The only assumption is that the asset price is unchanged
 * between the snapshot and the mint, which is stated in KNOWN_LIMITATIONS.
 *
 * When an agent currently backs nothing, `currentRatioBIPS` is reported by the
 * protocol as a sentinel maximum (no exposure => no meaningful ratio). In that
 * case the projected ratio is undefined from the ratio alone, so this returns
 * `undefined` and the caller must treat the agent as "unmeasurable".
 */
export function projectRatioBIPS(
  currentRatioBIPS: bigint,
  backedBeforeUBA: bigint,
  mintAmountUBA: bigint,
): bigint | undefined {
  if (mintAmountUBA < 0n) {
    throw new Error("Mint amount cannot be negative");
  }
  if (backedBeforeUBA <= 0n) {
    return undefined;
  }

  return (currentRatioBIPS * backedBeforeUBA) / (backedBeforeUBA + mintAmountUBA);
}

/**
 * Collateral headroom: how far the ratio sits above the threshold at which the
 * protocol may liquidate the agent. Expressed in BIPS, so 5_700 = +0.57x.
 * A negative value means the agent is at or below the liquidation trigger.
 */
export function headroomBIPS(
  ratioBIPS: bigint,
  liquidationThresholdBIPS: bigint,
): bigint {
  return ratioBIPS - liquidationThresholdBIPS;
}
