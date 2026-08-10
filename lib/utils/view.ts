import type { Comparison } from "../scoring/explain";
import type { Ranking } from "../scoring/rank-agents";
import { buildSnapshotCommitment } from "../attestation/snapshot-hash";
import { explainRecommendation } from "../scoring/explain";
import { liquidationMoveBips } from "../scoring/liquidation";

/**
 * Wire format. bigints are serialised as decimal strings because JSON has no
 * integer type wide enough for UBA amounts, and silently going through a
 * double would corrupt the very numbers the snapshot commits to.
 */
export type AgentView = {
  rank: number;
  agentVault: string;
  eligible: boolean;
  ineligibilityReasons: string[];
  feeBIPS: string;
  feeAmountUBA: string;
  score: number;
  components: {
    projectedHeadroom: number;
    currentHealth: number;
    capacityBuffer: number;
    fee: number;
  };
  bindingLeg: LegView;
  vaultLeg: LegView;
  poolLeg: LegView;
  availableCapacityUBA: string;
  capacityAfterMintUBA: string;
  backedBeforeUBA: string;
  shareOfBackingPct: number;
  /** Signed BIPS: how far XRP can fall before this agent breaches (negative). */
  liquidationMoveBips: string;
};

export type LegView = {
  label: string;
  tokenSymbol: string;
  currentRatioBIPS: string;
  projectedRatioBIPS: string | null;
  liquidationThresholdBIPS: string;
  safetyThresholdBIPS: string;
  currentHeadroomBIPS: string;
  projectedHeadroomBIPS: string | null;
};

export type OracleView = {
  ftsoV2: string;
  feedId: string;
  priceUsd: number | null;
  ageSeconds: number | null;
  fresh: boolean;
};

export type RankingView = {
  chainId: number;
  assetManager: string;
  blockNumber: string;
  blockTimestamp: string;
  mintAmountUBA: string;
  mintAmountFxrp: string;
  assetUnitUBA: string;
  /** What-if price shock (BIPS) applied for sensitivity analysis; 0 = none. */
  whatIfShockBips: number;
  /** Live FTSO XRP/USD reading (informational; may be null on testnet). */
  oracle: OracleView | null;

  agentsAnalyzed: number;
  eligibleCount: number;
  feeSpreadExists: boolean;

  agents: AgentView[];
  recommendedVault: string | null;
  cheapestVault: string | null;
  recommendationMatchesCheapest: boolean;

  comparison: Omit<Comparison, "feeDeltaBIPS" | "headroomDeltaBIPS" | "extraFeeUBA"> & {
    feeDeltaBIPS: string;
    headroomDeltaBIPS: string | null;
    extraFeeUBA: string;
  };

  concentration: {
    hhi: number;
    minPossibleHhi: number;
    totalBackedUBA: string;
    agentCount: number;
  };

  snapshotHash: string;
  snapshotVersion: string;
};

function legView(leg: {
  label: string;
  tokenSymbol: string;
  currentRatioBIPS: bigint;
  projectedRatioBIPS: bigint | undefined;
  liquidationThresholdBIPS: bigint;
  safetyThresholdBIPS: bigint;
  currentHeadroomBIPS: bigint;
  projectedHeadroomBIPS: bigint | undefined;
}): LegView {
  return {
    label: leg.label,
    tokenSymbol: leg.tokenSymbol,
    currentRatioBIPS: leg.currentRatioBIPS.toString(),
    projectedRatioBIPS: leg.projectedRatioBIPS?.toString() ?? null,
    liquidationThresholdBIPS: leg.liquidationThresholdBIPS.toString(),
    safetyThresholdBIPS: leg.safetyThresholdBIPS.toString(),
    currentHeadroomBIPS: leg.currentHeadroomBIPS.toString(),
    projectedHeadroomBIPS: leg.projectedHeadroomBIPS?.toString() ?? null,
  };
}

export function toRankingView(ranking: Ranking): RankingView {
  const commitment = buildSnapshotCommitment(ranking);
  const comparison = explainRecommendation(ranking);

  return {
    chainId: ranking.chainId,
    assetManager: ranking.assetManager,
    blockNumber: ranking.blockNumber.toString(),
    blockTimestamp: ranking.blockTimestamp.toString(),
    mintAmountUBA: ranking.mintAmountUBA.toString(),
    mintAmountFxrp: (ranking.mintAmountUBA / ranking.assetUnitUBA).toString(),
    assetUnitUBA: ranking.assetUnitUBA.toString(),
    whatIfShockBips: 0,
    oracle: null,

    agentsAnalyzed: ranking.agentsAnalyzed,
    eligibleCount: ranking.eligibleCount,
    feeSpreadExists: ranking.feeSpreadExists,

    agents: ranking.agents.map((a) => ({
      rank: a.rank,
      agentVault: a.snapshot.agentVault,
      eligible: a.eligible,
      ineligibilityReasons: a.ineligibilityReasons,
      feeBIPS: a.feeBIPS.toString(),
      feeAmountUBA: a.feeAmountUBA.toString(),
      score: a.score,
      components: a.components,
      bindingLeg: legView(a.bindingLeg),
      vaultLeg: legView(a.vaultLeg),
      poolLeg: legView(a.poolLeg),
      availableCapacityUBA: a.availableCapacityUBA.toString(),
      capacityAfterMintUBA: a.capacityAfterMintUBA.toString(),
      backedBeforeUBA: a.backedBeforeUBA.toString(),
      shareOfBackingPct: Number(a.shareOfBackingScaled) / 1e16,
      liquidationMoveBips: liquidationMoveBips(a).toString(),
    })),

    recommendedVault: ranking.recommended?.snapshot.agentVault ?? null,
    cheapestVault: ranking.cheapest?.snapshot.agentVault ?? null,
    recommendationMatchesCheapest: ranking.recommendationMatchesCheapest,

    comparison: {
      ...comparison,
      feeDeltaBIPS: comparison.feeDeltaBIPS.toString(),
      headroomDeltaBIPS: comparison.headroomDeltaBIPS?.toString() ?? null,
      extraFeeUBA: comparison.extraFeeUBA.toString(),
    },

    concentration: {
      hhi: ranking.concentration.hhi,
      minPossibleHhi: Number(ranking.concentration.minPossibleHhiScaled) / 1e18,
      totalBackedUBA: ranking.concentration.totalBackedUBA.toString(),
      agentCount: ranking.concentration.agentCount,
    },

    snapshotHash: commitment.snapshotHash,
    snapshotVersion: commitment.version,
  };
}
