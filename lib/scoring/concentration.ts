import type { AgentSnapshot } from "../types/agent";
import { backedUBA } from "./headroom";

/**
 * Herfindahl-Hirschman Index over FXRP exposure across available agents.
 *
 *     share_i = backed_i / totalBacked
 *     HHI     = Σ share_i²
 *
 * HHI is a SYSTEM-level statistic. It says how concentrated FXRP backing is
 * across the agent set; it says nothing about whether any individual agent is
 * safe. LedgerGuard therefore reports it separately from agent risk and does
 * NOT fold it into the agent score as an arbitrary multiplier.
 *
 * Range: 1/n (perfectly even) .. 1 (a single agent backs everything).
 * Returned scaled by 1e18 so the value stays exact in integer math.
 */
export const HHI_SCALE = 10n ** 18n;

export type ConcentrationReport = {
  /** Σ share² scaled by 1e18. */
  hhiScaled: bigint;
  /** Same value as a float, for display only. */
  hhi: number;
  totalBackedUBA: bigint;
  agentCount: number;
  /** Per-agent share of total backing, scaled by 1e18. */
  shares: { agentVault: string; shareScaled: bigint; backedUBA: bigint }[];
  /** Lowest achievable HHI for this agent count (1/n), scaled by 1e18. */
  minPossibleHhiScaled: bigint;
};

export function computeConcentration(
  snapshots: readonly AgentSnapshot[],
): ConcentrationReport {
  const totalBackedUBA = snapshots.reduce((sum, a) => sum + backedUBA(a), 0n);
  const agentCount = snapshots.length;

  const shares = snapshots.map((agent) => {
    const backed = backedUBA(agent);
    return {
      agentVault: agent.agentVault,
      backedUBA: backed,
      shareScaled:
        totalBackedUBA === 0n ? 0n : (backed * HHI_SCALE) / totalBackedUBA,
    };
  });

  // Σ share² — divide back down once per term to stay in 1e18 scale.
  const hhiScaled =
    totalBackedUBA === 0n
      ? 0n
      : shares.reduce(
          (sum, s) => sum + (s.shareScaled * s.shareScaled) / HHI_SCALE,
          0n,
        );

  return {
    hhiScaled,
    hhi: Number(hhiScaled) / Number(HHI_SCALE),
    totalBackedUBA,
    agentCount,
    shares,
    minPossibleHhiScaled: agentCount === 0 ? 0n : HHI_SCALE / BigInt(agentCount),
  };
}

/**
 * Marginal system effect of routing this mint through a given agent: the HHI
 * the system would have afterwards. Directing a mint to an already-dominant
 * agent raises concentration; directing it elsewhere lowers it.
 *
 * This is reported to the user as system context. It is deliberately NOT part
 * of the agent safety score, because concentration is not a property the
 * individual mint's collateral position depends on.
 */
export function projectedConcentration(
  snapshots: readonly AgentSnapshot[],
  targetAgentVault: string,
  mintAmountUBA: bigint,
): ConcentrationReport {
  const projected = snapshots.map((agent) =>
    agent.agentVault.toLowerCase() === targetAgentVault.toLowerCase()
      ? { ...agent, mintedUBA: agent.mintedUBA + mintAmountUBA }
      : agent,
  );

  return computeConcentration(projected);
}
