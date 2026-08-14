import type {
  AgentSnapshot,
  CollateralTypeInfo,
  DirectMintingLimiter,
  FxrpAgentSnapshotResult,
} from "../types/agent";
import { computeConcentration, type ConcentrationReport } from "./concentration";
import { BIPS, backedUBA, headroomBIPS, projectRatioBIPS } from "./headroom";

/**
 * Weights of the composite score. They are declared here, in one place, and
 * documented in README "Scoring methodology". Every component is normalised to
 * [0,1] before weighting so no factor can dominate through raw magnitude.
 *
 * Rationale for the ordering:
 *  - Post-mint headroom is the binding constraint: it is the agent's collateral
 *    position after it has taken on the exposure implied by the FXRP amount the
 *    user enters (a redemption of that size), so it carries the most weight.
 *  - Current health is the starting position and a check that the agent was
 *    not already marginal before the exposure.
 *  - Capacity buffer rewards agents that are not left scraping their limit.
 *  - Fee is real user cost but is intentionally capped low: the entire premise
 *    is that a few BIPS of fee must not outrank a materially safer position.
 *
 * Note: under the current FAssets model FXRP is minted with a direct Core Vault
 * payment - there is no "mint agent" to choose. The amount the user enters
 * models the exposure a redemption of that size would place on an agent, so the
 * ranking answers "which agents hold enough safe collateral to back/redeem this
 * much FXRP, and which are the most crash-resilient?"
 *
 * Fee weight (0.10) is strictly less than post-mint headroom weight (0.50), so
 * a full fee advantage can never overturn a headroom deficit larger than 20%
 * of the observed headroom spread. That bound is asserted in the test suite.
 */
export const WEIGHTS = {
  projectedHeadroom: 0.5,
  currentHealth: 0.25,
  capacityBuffer: 0.15,
  fee: 0.1,
} as const;

/**
 * Headroom is normalised RELATIVE to the agent's own liquidation threshold,
 * not as an absolute ratio. A +0.30x buffer means something very different
 * above a 1.20x threshold (25% relative cushion) than above a 1.50x threshold
 * (20% cushion), and the vault and pool legs on Coston2 genuinely have
 * different thresholds. Relative headroom makes the two legs comparable.
 *
 *     relativeHeadroom = headroomBIPS / liquidationThresholdBIPS
 *
 * Saturates at 1.0 - a cushion equal to the whole threshold (i.e. a ratio of
 * 2x the liquidation point) is treated as fully safe. Beyond that, additional
 * collateral does not meaningfully change the risk of THIS mint.
 */
export const RELATIVE_HEADROOM_SATURATION = 1.0;

/** Capacity buffer treated as "ample": agent can absorb 10x this mint. */
export const CAPACITY_SATURATION_MULTIPLE = 10n;

export type CollateralLeg = {
  label: "vault" | "pool";
  token: string;
  tokenSymbol: string;
  currentRatioBIPS: bigint;
  projectedRatioBIPS: bigint | undefined;
  liquidationThresholdBIPS: bigint;
  safetyThresholdBIPS: bigint;
  currentHeadroomBIPS: bigint;
  projectedHeadroomBIPS: bigint | undefined;
};

export type IneligibilityReason =
  | "insufficient_capacity"
  | "not_normal_status"
  | "no_measurable_exposure"
  | "would_breach_liquidation";

export type RankedAgent = {
  snapshot: AgentSnapshot;
  rank: number;

  /** Both collateral legs, each projected independently. */
  vaultLeg: CollateralLeg;
  poolLeg: CollateralLeg;
  /**
   * The agent's binding constraint: the leg with the least projected headroom.
   * An agent is only as safe as its weakest collateral leg.
   */
  bindingLeg: CollateralLeg;

  backedBeforeUBA: bigint;
  backedAfterUBA: bigint;
  availableCapacityUBA: bigint;
  capacityAfterMintUBA: bigint;

  feeBIPS: bigint;
  /** Fee the user actually pays on this mint, in UBA. */
  feeAmountUBA: bigint;

  eligible: boolean;
  ineligibilityReasons: IneligibilityReason[];

  /** Normalised components in [0,1]; all visible to the user. */
  components: {
    projectedHeadroom: number;
    currentHealth: number;
    capacityBuffer: number;
    fee: number;
  };
  /** Weighted sum of the components, in [0,1]. */
  score: number;
  /**
   * Unsaturated relative projected headroom on the binding leg. The score
   * saturates by design (beyond a 2x-of-threshold cushion, extra collateral
   * does not change this mint's risk), which means well-collateralised agents
   * can legitimately tie at 1.0. This raw value breaks such ties on real risk
   * rather than on address ordering.
   */
  bindingRelativeHeadroom: number;

  /** System-level context, reported separately from the agent score. */
  shareOfBackingScaled: bigint;
};

export type Ranking = {
  chainId: number;
  assetManager: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  mintAmountUBA: bigint;
  assetUnitUBA: bigint;

  agents: RankedAgent[];
  recommended: RankedAgent | undefined;
  cheapest: RankedAgent | undefined;
  /** True when the safest choice is also the cheapest - no trade-off to explain. */
  recommendationMatchesCheapest: boolean;

  concentration: ConcentrationReport;
  agentsAnalyzed: number;
  eligibleCount: number;
  /**
   * False when every eligible agent charges the same fee. In that case there
   * is no cheapest-vs-safest trade-off to make and the UI must say so rather
   * than manufacture one. This is the current situation on Coston2, where all
   * available agents charge 0.25%.
   */
  feeSpreadExists: boolean;
  minFeeBIPS: bigint;
  maxFeeBIPS: bigint;
  /** Live Core Vault direct-minting rate-limiter state at the snapshot block. */
  directMinting: DirectMintingLimiter;
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Relative headroom -> [0,1], saturating at RELATIVE_HEADROOM_SATURATION. */
function normaliseHeadroom(
  headroom: bigint | undefined,
  liquidationThresholdBIPS: bigint,
): number {
  if (headroom === undefined) return 0;
  if (headroom <= 0n) return 0;
  if (liquidationThresholdBIPS <= 0n) return 0;
  const relative = Number(headroom) / Number(liquidationThresholdBIPS);
  return clamp01(relative / RELATIVE_HEADROOM_SATURATION);
}

function buildLeg(
  label: "vault" | "pool",
  token: string,
  collateralType: CollateralTypeInfo | undefined,
  currentRatioBIPS: bigint,
  backedBefore: bigint,
  mintAmountUBA: bigint,
): CollateralLeg {
  if (!collateralType) {
    throw new Error(`No collateral type found for ${label} token ${token}`);
  }

  const projectedRatioBIPS = projectRatioBIPS(
    currentRatioBIPS,
    backedBefore,
    mintAmountUBA,
  );

  return {
    label,
    token,
    tokenSymbol: collateralType.tokenFtsoSymbol,
    currentRatioBIPS,
    projectedRatioBIPS,
    liquidationThresholdBIPS: collateralType.minCollateralRatioBIPS,
    safetyThresholdBIPS: collateralType.safetyMinCollateralRatioBIPS,
    currentHeadroomBIPS: headroomBIPS(
      currentRatioBIPS,
      collateralType.minCollateralRatioBIPS,
    ),
    projectedHeadroomBIPS:
      projectedRatioBIPS === undefined
        ? undefined
        : headroomBIPS(projectedRatioBIPS, collateralType.minCollateralRatioBIPS),
  };
}

/**
 * Deterministic, explainable ranking of the available agents for one amount of
 * FXRP exposure (a redemption of that size).
 *
 * Pure function: identical inputs always produce an identical ranking, with no
 * clock, no randomness, and no network access. This is what makes the anchored
 * snapshot hash independently reproducible.
 */
export function rankAgents(
  state: FxrpAgentSnapshotResult,
  mintAmountUBA: bigint,
): Ranking {
  if (mintAmountUBA <= 0n) {
    throw new Error("Mint amount must be positive");
  }

  const concentration = computeConcentration(state.snapshots);
  const shareByAgent = new Map(
    concentration.shares.map((s) => [s.agentVault.toLowerCase(), s.shareScaled]),
  );

  const feeSpread = (() => {
    const fees = state.snapshots.map((a) => a.feeBIPS);
    if (fees.length === 0) return { min: 0n, max: 0n };
    return {
      min: fees.reduce((a, b) => (a < b ? a : b)),
      max: fees.reduce((a, b) => (a > b ? a : b)),
    };
  })();

  const capacitySaturationUBA = mintAmountUBA * CAPACITY_SATURATION_MULTIPLE;

  const partial = state.snapshots.map((snapshot) => {
    const backedBefore = backedUBA(snapshot);
    const backedAfter = backedBefore + mintAmountUBA;

    const vaultLeg = buildLeg(
      "vault",
      snapshot.vaultCollateralToken,
      state.vaultCollateralTypes.find(
        (t) => t.token.toLowerCase() === snapshot.vaultCollateralToken.toLowerCase(),
      ),
      snapshot.vaultCollateralRatioBIPS,
      backedBefore,
      mintAmountUBA,
    );
    const poolLeg = buildLeg(
      "pool",
      snapshot.poolWNatToken,
      state.poolCollateralType,
      snapshot.poolCollateralRatioBIPS,
      backedBefore,
      mintAmountUBA,
    );

    // The binding leg is the one with the least RELATIVE projected headroom
    // (headroom measured against its own liquidation threshold), since the two
    // legs have different thresholds and are otherwise not comparable.
    // An unmeasurable leg cannot be shown to be safe, so it is treated as binding.
    const bindingLeg = ((): CollateralLeg => {
      if (vaultLeg.projectedHeadroomBIPS === undefined) return vaultLeg;
      if (poolLeg.projectedHeadroomBIPS === undefined) return poolLeg;
      const vaultRel =
        Number(vaultLeg.projectedHeadroomBIPS) /
        Number(vaultLeg.liquidationThresholdBIPS);
      const poolRel =
        Number(poolLeg.projectedHeadroomBIPS) /
        Number(poolLeg.liquidationThresholdBIPS);
      return poolRel < vaultRel ? poolLeg : vaultLeg;
    })();

    const hasCapacity = snapshot.availableCapacityUBA >= mintAmountUBA;
    const capacityAfterMintUBA = hasCapacity
      ? snapshot.availableCapacityUBA - mintAmountUBA
      : 0n;

    const reasons: IneligibilityReason[] = [];
    if (!hasCapacity) reasons.push("insufficient_capacity");
    if (snapshot.status !== 0) reasons.push("not_normal_status");
    if (bindingLeg.projectedHeadroomBIPS === undefined) {
      reasons.push("no_measurable_exposure");
    } else if (bindingLeg.projectedHeadroomBIPS <= 0n) {
      reasons.push("would_breach_liquidation");
    }

    // Current health uses the weaker leg by RELATIVE headroom, so the two
    // legs' different liquidation thresholds are compared on equal terms.
    const vaultCurrentNorm = normaliseHeadroom(
      vaultLeg.currentHeadroomBIPS,
      vaultLeg.liquidationThresholdBIPS,
    );
    const poolCurrentNorm = normaliseHeadroom(
      poolLeg.currentHeadroomBIPS,
      poolLeg.liquidationThresholdBIPS,
    );

    const components = {
      projectedHeadroom: normaliseHeadroom(
        bindingLeg.projectedHeadroomBIPS,
        bindingLeg.liquidationThresholdBIPS,
      ),
      currentHealth: Math.min(vaultCurrentNorm, poolCurrentNorm),
      capacityBuffer: clamp01(
        Number(
          capacityAfterMintUBA > capacitySaturationUBA
            ? capacitySaturationUBA
            : capacityAfterMintUBA,
        ) / Number(capacitySaturationUBA),
      ),
      fee:
        feeSpread.max === feeSpread.min
          ? 1
          : clamp01(
              Number(feeSpread.max - snapshot.feeBIPS) /
                Number(feeSpread.max - feeSpread.min),
            ),
    };

    const score =
      components.projectedHeadroom * WEIGHTS.projectedHeadroom +
      components.currentHealth * WEIGHTS.currentHealth +
      components.capacityBuffer * WEIGHTS.capacityBuffer +
      components.fee * WEIGHTS.fee;

    return {
      snapshot,
      rank: 0,
      vaultLeg,
      poolLeg,
      bindingLeg,
      backedBeforeUBA: backedBefore,
      backedAfterUBA: backedAfter,
      availableCapacityUBA: snapshot.availableCapacityUBA,
      capacityAfterMintUBA,
      feeBIPS: snapshot.feeBIPS,
      feeAmountUBA: (mintAmountUBA * snapshot.feeBIPS) / BIPS,
      eligible: reasons.length === 0,
      ineligibilityReasons: reasons,
      components,
      score,
      bindingRelativeHeadroom:
        bindingLeg.projectedHeadroomBIPS === undefined ||
        bindingLeg.liquidationThresholdBIPS <= 0n
          ? 0
          : Number(bindingLeg.projectedHeadroomBIPS) /
            Number(bindingLeg.liquidationThresholdBIPS),
      shareOfBackingScaled:
        shareByAgent.get(snapshot.agentVault.toLowerCase()) ?? 0n,
    } satisfies RankedAgent;
  });

  // Eligible agents always outrank ineligible ones; then by score descending.
  // Scores saturate by design, so equal scores are broken by raw (unsaturated)
  // relative headroom, then by lower fee, then by vault address so the ordering
  // is total, deterministic and never depends on input order.
  partial.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.bindingRelativeHeadroom !== b.bindingRelativeHeadroom) {
      return b.bindingRelativeHeadroom - a.bindingRelativeHeadroom;
    }
    if (a.feeBIPS !== b.feeBIPS) return a.feeBIPS < b.feeBIPS ? -1 : 1;
    return a.snapshot.agentVault.toLowerCase() <
      b.snapshot.agentVault.toLowerCase()
      ? -1
      : 1;
  });
  partial.forEach((agent, index) => {
    agent.rank = index + 1;
  });

  const eligible = partial.filter((a) => a.eligible);
  const recommended = eligible[0];
  // Cheapest = lowest fee. When fees tie (currently the case on Coston2, where
  // every agent charges 0.25%), fall back to the ranking order itself so the
  // two selections stay mutually consistent instead of disagreeing via a
  // separate address tiebreak.
  const cheapest = [...eligible].sort((a, b) => {
    if (a.feeBIPS !== b.feeBIPS) return a.feeBIPS < b.feeBIPS ? -1 : 1;
    return a.rank - b.rank;
  })[0];

  return {
    chainId: state.chainId,
    assetManager: state.assetManager,
    blockNumber: state.blockNumber,
    blockTimestamp: state.blockTimestamp,
    mintAmountUBA,
    assetUnitUBA: state.assetUnitUBA,
    agents: partial,
    recommended,
    cheapest,
    recommendationMatchesCheapest:
      recommended !== undefined &&
      cheapest !== undefined &&
      recommended.snapshot.agentVault === cheapest.snapshot.agentVault,
    concentration,
    agentsAnalyzed: partial.length,
    eligibleCount: eligible.length,
    feeSpreadExists: eligible.some((a) => a.feeBIPS !== eligible[0]?.feeBIPS),
    minFeeBIPS: feeSpread.min,
    maxFeeBIPS: feeSpread.max,
    directMinting: state.directMinting,
  };
}
