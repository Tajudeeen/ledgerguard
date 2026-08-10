import { describe, expect, it } from "vitest";

import { buildTrails, type AttestationRecord } from "../lib/attestation/trail";
import type { RankingView } from "../lib/utils/view";

function agent(vault: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    rank: 1,
    agentVault: vault,
    eligible: true,
    ineligibilityReasons: [],
    feeBIPS: "25",
    feeAmountUBA: "125",
    score: 1,
    components: {
      projectedHeadroom: 1,
      currentHealth: 1,
      capacityBuffer: 1,
      fee: 1,
    },
    bindingLeg: {
      label: "vault" as const,
      tokenSymbol: "testUSDT",
      currentRatioBIPS: "20000",
      projectedRatioBIPS: "15000",
      liquidationThresholdBIPS: "12000",
      safetyThresholdBIPS: "13000",
      currentHeadroomBIPS: "8000",
      projectedHeadroomBIPS: "3000",
    },
    vaultLeg: {
      label: "vault" as const,
      tokenSymbol: "testUSDT",
      currentRatioBIPS: "20000",
      projectedRatioBIPS: "15000",
      liquidationThresholdBIPS: "12000",
      safetyThresholdBIPS: "13000",
      currentHeadroomBIPS: "8000",
      projectedHeadroomBIPS: "3000",
    },
    poolLeg: {
      label: "pool" as const,
      tokenSymbol: "C2FLR",
      currentRatioBIPS: "25000",
      projectedRatioBIPS: "20000",
      liquidationThresholdBIPS: "15000",
      safetyThresholdBIPS: "16000",
      currentHeadroomBIPS: "10000",
      projectedHeadroomBIPS: "5000",
    },
    availableCapacityUBA: "1000000000",
    capacityAfterMintUBA: "900000000",
    backedBeforeUBA: "500000000",
    shareOfBackingPct: 25,
    ...over,
  };
}

function view(recommended: string, agents: ReturnType<typeof agent>[]): RankingView {
  return {
    chainId: 114,
    assetManager: "0xasset",
    blockNumber: "1",
    blockTimestamp: "1",
    mintAmountUBA: "500000000",
    mintAmountFxrp: "500",
    assetUnitUBA: "1000000",
    whatIfShockBips: 0,
    oracle: null,
    agentsAnalyzed: agents.length,
    eligibleCount: agents.filter((a) => a.eligible).length,
    feeSpreadExists: false,
    agents: agents as unknown as RankingView["agents"],
    recommendedVault: recommended,
    cheapestVault: recommended,
    recommendationMatchesCheapest: true,
    comparison: {
      kind: "no_fee_spread",
      headline: "h",
      detail: "d",
      feeDeltaBIPS: "0",
      headroomDeltaBIPS: "0",
      extraFeeUBA: "0",
    },
    concentration: { hhi: 0.25, minPossibleHhi: 0.25, totalBackedUBA: "1", agentCount: 4 },
    snapshotHash: "0xhash",
    snapshotVersion: "LEDGERGUARD-V1",
  };
}

function rec(id: number, block: number, recommended: string): AttestationRecord {
  return {
    id,
    snapshotHash: `0xhash${id}`,
    snapshotBlock: block,
    attestedAtMs: block * 1000,
    agentCount: 4,
    mintAmountUBA: "500000000",
    recommendedAgent: recommended,
    submitter: "0xsender",
  };
}

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const Z = "0x0000000000000000000000000000000000000000";

describe("buildTrails", () => {
  it("reconstructs per-agent points from attestation records", async () => {
    const records = [rec(0, 100, A), rec(1, 200, A), rec(2, 300, B)];
    const rankingFor = (_id: number) => {
      if (_id === 0) return view(A, [agent(A), agent(B)]);
      if (_id === 1) return view(A, [agent(A), agent(B, { eligible: false })]);
      return view(B, [agent(A), agent(B)]);
    };

    const trails = await buildTrails(records, rankingFor);
    expect(trails).toHaveLength(2);

    const a = trails.find((t) => t.agentVault === A)!;
    expect(a.observations).toBe(3);
    expect(a.timesRecommended).toBe(2); // rec 0 and rec 1
    expect(a.eligibleObservations).toBe(3);

    const b = trails.find((t) => t.agentVault === B)!;
    expect(b.observations).toBe(3);
    expect(b.timesRecommended).toBe(1); // only rec 2
    expect(b.eligibleObservations).toBe(2); // not eligible in rec 1

    // Points are oldest-first.
    expect(a.points.map((p) => p.attestationId)).toEqual([0, 1, 2]);
  });

  it("flags a breach when a point's projected headroom goes non-positive", async () => {
    const records = [rec(0, 100, A)];
    const rankingFor = () =>
      view(A, [
        agent(A, { bindingLeg: { ...agent(A).bindingLeg, projectedHeadroomBIPS: "-500" } }),
      ]);

    const trails = await buildTrails(records, rankingFor);
    expect(trails[0].everBreached).toBe(true);
    expect(trails[0].stabilityScore).toBeLessThan(1);
  });

  it("orders agents by stability score, then observations, then address", async () => {
    const records = [rec(0, 100, A)];
    const rankingFor = () => view(A, [agent(A), agent(B, { eligible: false }), agent(Z)]);

    const trails = await buildTrails(records, rankingFor);
    // A (eligible, recommended) should rank above B (ineligible) and Z.
    expect(trails[0].agentVault).toBe(A);
  });

  it("tolerates a missing cached ranking for an id", async () => {
    const records = [rec(0, 100, A)]; // no rankingFor entry
    const trails = await buildTrails(records, () => null);
    expect(trails).toHaveLength(0);
  });

  it("availability is 1 when all observations are eligible", async () => {
    const records = [rec(0, 100, A), rec(1, 200, A)];
    const rankingFor = () => view(A, [agent(A)]);
    const trails = await buildTrails(records, rankingFor);
    expect(trails[0].stabilityComponents.availability).toBe(1);
    expect(trails[0].stabilityComponents.recommendedShare).toBe(1);
  });
});
