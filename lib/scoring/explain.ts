import { BIPS } from "./headroom";
import type { RankedAgent, Ranking } from "./rank-agents";

/** 12_345 BIPS -> "1.23x" */
export function formatRatio(bips: bigint | undefined): string {
  if (bips === undefined) return "n/a";
  const scaled = (bips * 100n) / BIPS; // hundredths of x
  const whole = scaled / 100n;
  const frac = scaled < 0n ? -(scaled % 100n) : scaled % 100n;
  return `${whole}.${frac.toString().padStart(2, "0")}x`;
}

/** 5_700 BIPS -> "+0.57x" */
export function formatHeadroom(bips: bigint | undefined): string {
  if (bips === undefined) return "n/a";
  const sign = bips < 0n ? "-" : "+";
  return `${sign}${formatRatio(bips < 0n ? -bips : bips)}`;
}

/** 25 BIPS -> "0.25%" */
export function formatFee(bips: bigint): string {
  const hundredths = bips; // 1 BIPS = 0.01%
  const whole = hundredths / 100n;
  const frac = hundredths % 100n;
  return `${whole}.${frac.toString().padStart(2, "0")}%`;
}

export function formatUBA(uba: bigint, assetUnitUBA: bigint): string {
  const whole = uba / assetUnitUBA;
  return whole.toLocaleString("en-US");
}

export type Comparison = {
  kind:
    | "same_agent"
    | "trade_off"
    | "no_fee_spread"
    | "no_eligible_agents";
  headline: string;
  detail: string;
  feeDeltaBIPS: bigint;
  headroomDeltaBIPS: bigint | undefined;
  extraFeeUBA: bigint;
};

/**
 * Builds the "why this agent?" explanation entirely from the ranked
 * numbers. Under the current FAssets model there is no agent chosen at mint
 * time — the amount entered gauges how much FXRP a redemption of this size would
 * require, so the view shows which agents hold enough free collateral to cover
 * it and which are safest to redeem with. Nothing here is hardcoded or
 * templated with example values; if the chain state changes, the sentence
 * changes with it.
 */
export function explainRecommendation(ranking: Ranking): Comparison {
  const { recommended, cheapest, assetUnitUBA } = ranking;

  if (!recommended || !cheapest) {
    return {
      kind: "no_eligible_agents",
      headline: "No agent can currently cover this redemption",
      detail:
        "No available agent has enough free capacity for a redemption of this size at the " +
        "snapshot block. Try a smaller amount, or check back once agents " +
        "top up collateral.",
      feeDeltaBIPS: 0n,
      headroomDeltaBIPS: undefined,
      extraFeeUBA: 0n,
    };
  }

  const feeDeltaBIPS = recommended.feeBIPS - cheapest.feeBIPS;
  const extraFeeUBA = recommended.feeAmountUBA - cheapest.feeAmountUBA;
  const recHeadroom = recommended.bindingLeg.projectedHeadroomBIPS;
  const cheapHeadroom = cheapest.bindingLeg.projectedHeadroomBIPS;
  const headroomDeltaBIPS =
    recHeadroom === undefined || cheapHeadroom === undefined
      ? undefined
      : recHeadroom - cheapHeadroom;

  if (ranking.recommendationMatchesCheapest) {
    // Every eligible agent charges the same fee, so "cheapest" carries no
    // information. Rather than manufacture a trade-off that does not exist,
    // contrast the recommendation with the WEAKEST agent the user could
    // otherwise have picked at exactly the same price.
    if (!ranking.feeSpreadExists) {
      const eligible = ranking.agents.filter((a) => a.eligible);
      const weakest = eligible[eligible.length - 1];

      if (!weakest || weakest.snapshot.agentVault === recommended.snapshot.agentVault) {
        return {
          kind: "no_fee_spread",
          headline: `Only one agent can take this mint`,
          detail:
            `${short(recommended)} is the sole eligible agent at this size. ` +
            `Its ${recommended.bindingLeg.label} ratio moves from ` +
            `${formatRatio(recommended.bindingLeg.currentRatioBIPS)} to ` +
            `${formatRatio(recommended.bindingLeg.projectedRatioBIPS)} against a ` +
            `${formatRatio(recommended.bindingLeg.liquidationThresholdBIPS)} liquidation threshold.`,
          feeDeltaBIPS: 0n,
          headroomDeltaBIPS: 0n,
          extraFeeUBA: 0n,
        };
      }

      const weakHeadroom = weakest.bindingLeg.projectedHeadroomBIPS;
      const delta =
        recHeadroom === undefined || weakHeadroom === undefined
          ? undefined
          : recHeadroom - weakHeadroom;

      return {
        kind: "no_fee_spread",
        headline:
          `Every available agent charges the same ${formatFee(recommended.feeBIPS)} fee — ` +
          `so fee tells you nothing, and collateral position is the whole decision`,
        detail:
          `At an identical price you could redeem through ${short(weakest)}, ` +
          `whose ${weakest.bindingLeg.label} ratio would sit at ` +
          `${formatRatio(weakest.bindingLeg.currentRatioBIPS)} with ` +
          `${formatHeadroom(weakHeadroom)} of headroom. ` +
          `${short(recommended)} instead leaves ${formatHeadroom(recHeadroom)}` +
          (delta === undefined ? "" : ` — ${formatHeadroom(delta)} more cushion`) +
          `, for exactly the same fee.`,
        feeDeltaBIPS: 0n,
        headroomDeltaBIPS: delta,
        extraFeeUBA: 0n,
      };
    }

    return {
      kind: "same_agent",
      headline: "The cheapest agent is also the strongest position",
      detail:
        `${short(recommended)} has both the lowest fee (${formatFee(recommended.feeBIPS)}) ` +
        `and the best projected collateral headroom (${formatHeadroom(recHeadroom)} on its ` +
        `${recommended.bindingLeg.label} leg). There is no trade-off to make here.`,
      feeDeltaBIPS: 0n,
      headroomDeltaBIPS: 0n,
      extraFeeUBA: 0n,
    };
  }

  const feePhrase =
    feeDeltaBIPS === 0n
      ? `charges the same fee (${formatFee(recommended.feeBIPS)})`
      : feeDeltaBIPS > 0n
        ? `costs ${formatFee(feeDeltaBIPS)} more (${formatUBA(extraFeeUBA, assetUnitUBA)} FXRP extra on this mint)`
        : `is actually ${formatFee(-feeDeltaBIPS)} cheaper`;

  const headroomPhrase =
    headroomDeltaBIPS === undefined
      ? "the cheapest agent's position cannot be measured from current exposure"
      : `it leaves ${formatHeadroom(recHeadroom)} of collateral headroom against liquidation ` +
        `instead of ${formatHeadroom(cheapHeadroom)} — a difference of ${formatHeadroom(headroomDeltaBIPS)}`;

  return {
    kind: "trade_off",
    headline: `${short(recommended)} ${feePhrase}, but ${headroomPhrase}`,
    detail:
      `A redemption of ${formatUBA(ranking.mintAmountUBA, assetUnitUBA)} FXRP would push ` +
      `${short(cheapest)}'s ${cheapest.bindingLeg.label} collateral ratio from ` +
      `${formatRatio(cheapest.bindingLeg.currentRatioBIPS)} to ` +
      `${formatRatio(cheapest.bindingLeg.projectedRatioBIPS)}, against a liquidation ` +
      `threshold of ${formatRatio(cheapest.bindingLeg.liquidationThresholdBIPS)}. ` +
      `The same redemption moves ${short(recommended)}'s ${recommended.bindingLeg.label} ratio from ` +
      `${formatRatio(recommended.bindingLeg.currentRatioBIPS)} to ` +
      `${formatRatio(recommended.bindingLeg.projectedRatioBIPS)} against a threshold of ` +
      `${formatRatio(recommended.bindingLeg.liquidationThresholdBIPS)}. ` +
      `A larger buffer means that agent can absorb a bigger adverse price move ` +
      `before the protocol is entitled to liquidate the collateral — the collateral ` +
      `that backs the FXRP you would be redeeming against.`,
    feeDeltaBIPS,
    headroomDeltaBIPS,
    extraFeeUBA,
  };
}

function short(agent: RankedAgent): string {
  const a = agent.snapshot.agentVault;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
