import { describe, expect, it } from "vitest";

import type {
  AgentSnapshot,
  CollateralTypeInfo,
  FxrpAgentSnapshotResult,
} from "../lib/types/agent";
import { backedUBA, headroomBIPS, projectRatioBIPS } from "../lib/scoring/headroom";
import { computeConcentration, HHI_SCALE } from "../lib/scoring/concentration";
import { rankAgents, WEIGHTS } from "../lib/scoring/rank-agents";
import { explainRecommendation } from "../lib/scoring/explain";
import { buildSnapshotCommitment } from "../lib/attestation/snapshot-hash";

const UNIT = 1_000_000n; // 1 FXRP = 1e6 UBA (assetDecimals = 6 on Coston2)

const VAULT_TOKEN = "0x21709E63fC7F264F329e0826Ea82197694B82775" as const;
const POOL_TOKEN = "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273" as const;

const VAULT_TYPE: CollateralTypeInfo = {
  collateralClass: 2,
  token: VAULT_TOKEN,
  decimals: 6n,
  tokenFtsoSymbol: "testUSDT",
  assetFtsoSymbol: "testXRP",
  minCollateralRatioBIPS: 12_000n,
  safetyMinCollateralRatioBIPS: 13_000n,
};

const POOL_TYPE: CollateralTypeInfo = {
  collateralClass: 1,
  token: POOL_TOKEN,
  decimals: 18n,
  tokenFtsoSymbol: "C2FLR",
  assetFtsoSymbol: "testXRP",
  minCollateralRatioBIPS: 15_000n,
  safetyMinCollateralRatioBIPS: 16_000n,
};

function agent(over: Partial<AgentSnapshot> & { agentVault: `0x${string}` }): AgentSnapshot {
  return {
    ownerManagementAddress: "0x1111111111111111111111111111111111111111",
    status: 0,
    feeBIPS: 25n,
    freeCollateralLots: 100n,
    availableCapacityUBA: 1_000n * UNIT,
    vaultCollateralToken: VAULT_TOKEN,
    vaultCollateralRatioBIPS: 20_000n,
    totalVaultCollateralWei: 1_000_000n,
    poolWNatToken: POOL_TOKEN,
    poolCollateralRatioBIPS: 25_000n,
    totalPoolCollateralNATWei: 10n ** 24n,
    mintedUBA: 1_000n * UNIT,
    reservedUBA: 0n,
    redeemingUBA: 0n,
    poolRedeemingUBA: 0n,
    ...over,
  };
}

function state(snapshots: AgentSnapshot[]): FxrpAgentSnapshotResult {
  return {
    chainId: 114,
    assetManager: "0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA",
    blockNumber: 1_000n,
    blockTimestamp: 1_700_000_000n,
    lotSizeAMG: 10_000_000n,
    assetMintingGranularityUBA: 1n,
    assetUnitUBA: UNIT,
    assetDecimals: 6,
    vaultCollateralTypes: [VAULT_TYPE],
    poolCollateralType: POOL_TYPE,
    snapshots,
    directMinting: {
      hourlyLimitUBA: 0n,
      dailyLimitUBA: 0n,
      hourlyMintedUBA: 0n,
      dailyMintedUBA: 0n,
      largeMintingThresholdUBA: 0n,
      largeMintingDelaySeconds: 0n,
      unblockUntilTimestamp: 0n,
      executorFeeBIPS: 0n,
    },
  };
}

const A = "0xaa00000000000000000000000000000000000001" as const;
const B = "0xbb00000000000000000000000000000000000002" as const;
const C = "0xcc00000000000000000000000000000000000003" as const;

describe("backedUBA", () => {
  it("counts minted, reserved and redeeming as live exposure", () => {
    expect(
      backedUBA(agent({ agentVault: A, mintedUBA: 10n, reservedUBA: 3n, redeemingUBA: 2n })),
    ).toBe(15n);
  });
});

describe("projectRatioBIPS", () => {
  it("scales the ratio inversely with backed amount", () => {
    // 2.00x backing 1000, mint 1000 => backing 2000 => 1.00x
    expect(projectRatioBIPS(20_000n, 1_000n, 1_000n)).toBe(10_000n);
  });

  it("is the identity when nothing is minted", () => {
    expect(projectRatioBIPS(18_400n, 500n, 0n)).toBe(18_400n);
  });

  it("returns undefined when the agent currently backs nothing", () => {
    expect(projectRatioBIPS(10n ** 12n, 0n, 100n)).toBeUndefined();
  });

  it("rejects negative mints", () => {
    expect(() => projectRatioBIPS(10_000n, 1n, -1n)).toThrow();
  });

  it("degrades monotonically as the mint grows", () => {
    const small = projectRatioBIPS(20_000n, 1_000n, 100n)!;
    const large = projectRatioBIPS(20_000n, 1_000n, 5_000n)!;
    expect(large).toBeLessThan(small);
  });

  it("survives an extreme mint without overflow or NaN", () => {
    const huge = 10n ** 30n;
    const r = projectRatioBIPS(20_000n, 1_000n, huge)!;
    expect(r).toBeGreaterThanOrEqual(0n);
    expect(r).toBeLessThan(20_000n);
  });
});

describe("headroomBIPS", () => {
  it("is positive above the threshold and negative below it", () => {
    expect(headroomBIPS(18_400n, 11_000n)).toBe(7_400n);
    expect(headroomBIPS(10_500n, 11_000n)).toBe(-500n);
  });
});

describe("HHI concentration", () => {
  it("is 1 when a single agent backs everything", () => {
    const r = computeConcentration([agent({ agentVault: A, mintedUBA: 100n })]);
    expect(r.hhiScaled).toBe(HHI_SCALE);
  });

  it("is 1/n when exposure is spread evenly", () => {
    const r = computeConcentration([
      agent({ agentVault: A, mintedUBA: 100n }),
      agent({ agentVault: B, mintedUBA: 100n }),
      agent({ agentVault: C, mintedUBA: 100n }),
    ]);
    // 3 * (1/3)^2 = 1/3, within rounding of integer division
    expect(Number(r.hhiScaled) / Number(HHI_SCALE)).toBeCloseTo(1 / 3, 9);
    expect(r.minPossibleHhiScaled).toBe(HHI_SCALE / 3n);
  });

  it("is 0 and does not divide by zero when total exposure is zero", () => {
    const r = computeConcentration([
      agent({ agentVault: A, mintedUBA: 0n }),
      agent({ agentVault: B, mintedUBA: 0n }),
    ]);
    expect(r.hhiScaled).toBe(0n);
    expect(r.totalBackedUBA).toBe(0n);
  });

  it("rises when exposure becomes more concentrated", () => {
    const even = computeConcentration([
      agent({ agentVault: A, mintedUBA: 100n }),
      agent({ agentVault: B, mintedUBA: 100n }),
    ]);
    const skewed = computeConcentration([
      agent({ agentVault: A, mintedUBA: 190n }),
      agent({ agentVault: B, mintedUBA: 10n }),
    ]);
    expect(skewed.hhiScaled).toBeGreaterThan(even.hhiScaled);
  });

  it("handles an empty agent set", () => {
    const r = computeConcentration([]);
    expect(r.hhiScaled).toBe(0n);
    expect(r.agentCount).toBe(0);
  });
});

describe("rankAgents", () => {
  it("ranks the agent with more post-mint headroom above a marginally cheaper one", () => {
    const safe = agent({
      agentVault: A,
      feeBIPS: 30n,
      vaultCollateralRatioBIPS: 60_000n,
      poolCollateralRatioBIPS: 60_000n,
    });
    // Thin but still above its thresholds after the mint, so it stays
    // eligible and the comparison is a real trade-off rather than a rejection.
    const cheapAndThin = agent({
      agentVault: B,
      feeBIPS: 25n,
      vaultCollateralRatioBIPS: 14_000n,
      poolCollateralRatioBIPS: 20_000n,
    });

    const r = rankAgents(state([safe, cheapAndThin]), 100n * UNIT);
    expect(r.recommended!.snapshot.agentVault).toBe(A);
    expect(r.cheapest!.snapshot.agentVault).toBe(B);
    expect(r.recommendationMatchesCheapest).toBe(false);
    expect(r.feeSpreadExists).toBe(true);
  });

  it("never lets fee outweigh safety: fee weight is below post-mint headroom weight", () => {
    expect(WEIGHTS.fee).toBeLessThan(WEIGHTS.projectedHeadroom);
    expect(WEIGHTS.fee).toBeLessThan(WEIGHTS.currentHealth);
    const total =
      WEIGHTS.projectedHeadroom +
      WEIGHTS.currentHealth +
      WEIGHTS.capacityBuffer +
      WEIGHTS.fee;
    expect(total).toBeCloseTo(1, 12);
  });

  it("a zero-fee agent cannot outrank a materially safer one", () => {
    const free = agent({
      agentVault: B,
      feeBIPS: 0n,
      vaultCollateralRatioBIPS: 14_000n, // thin, but survives the mint
      poolCollateralRatioBIPS: 60_000n,
    });
    const safeButPricier = agent({
      agentVault: A,
      feeBIPS: 100n,
      vaultCollateralRatioBIPS: 60_000n,
      poolCollateralRatioBIPS: 60_000n,
    });
    const r = rankAgents(state([free, safeButPricier]), 100n * UNIT);
    expect(r.recommended!.snapshot.agentVault).toBe(A);
    expect(r.cheapest!.snapshot.agentVault).toBe(B);
  });

  it("marks agents with insufficient capacity ineligible and ranks them last", () => {
    const tiny = agent({ agentVault: A, availableCapacityUBA: 10n * UNIT });
    const big = agent({ agentVault: B, availableCapacityUBA: 10_000n * UNIT });

    const r = rankAgents(state([tiny, big]), 500n * UNIT);
    const ranked = r.agents.find((a) => a.snapshot.agentVault === A)!;
    expect(ranked.eligible).toBe(false);
    expect(ranked.ineligibilityReasons).toContain("insufficient_capacity");
    expect(ranked.rank).toBe(2);
    expect(r.recommended!.snapshot.agentVault).toBe(B);
    expect(r.eligibleCount).toBe(1);
  });

  it("treats a non-normal agent status as ineligible", () => {
    const liquidating = agent({ agentVault: A, status: 2 });
    const r = rankAgents(state([liquidating]), 10n * UNIT);
    expect(r.agents[0].ineligibilityReasons).toContain("not_normal_status");
    expect(r.recommended).toBeUndefined();
  });

  it("flags an agent whose mint would breach the liquidation threshold", () => {
    // 1.21x vault against a 1.20x threshold, then doubled exposure.
    const marginal = agent({
      agentVault: A,
      vaultCollateralRatioBIPS: 12_100n,
      poolCollateralRatioBIPS: 60_000n,
      mintedUBA: 1_000n * UNIT,
    });
    const r = rankAgents(state([marginal]), 1_000n * UNIT);
    const a = r.agents[0];
    expect(a.bindingLeg.projectedRatioBIPS).toBe(6_050n); // 1.21x -> 0.605x
    expect(a.ineligibilityReasons).toContain("would_breach_liquidation");
    expect(a.eligible).toBe(false);
    expect(a.components.projectedHeadroom).toBe(0);
  });

  it("treats an agent with no current exposure as unmeasurable, not as safe", () => {
    const fresh = agent({
      agentVault: A,
      mintedUBA: 0n,
      reservedUBA: 0n,
      redeemingUBA: 0n,
    });
    const r = rankAgents(state([fresh]), 100n * UNIT);
    expect(r.agents[0].bindingLeg.projectedRatioBIPS).toBeUndefined();
    expect(r.agents[0].ineligibilityReasons).toContain("no_measurable_exposure");
    expect(r.agents[0].components.projectedHeadroom).toBe(0);
  });

  it("picks the weaker collateral leg as binding, comparing legs relatively", () => {
    // Vault 1.30x over a 1.20x threshold => +8.3% relative.
    // Pool  1.80x over a 1.50x threshold => +20% relative.
    // Vault is weaker in relative terms even though pool's absolute gap is larger.
    const a = agent({
      agentVault: A,
      vaultCollateralRatioBIPS: 13_000n,
      poolCollateralRatioBIPS: 18_000n,
    });
    const r = rankAgents(state([a]), 1n);
    expect(r.agents[0].bindingLeg.label).toBe("vault");
  });

  it("is deterministic and independent of input ordering", () => {
    const a = agent({ agentVault: A, vaultCollateralRatioBIPS: 30_000n });
    const b = agent({ agentVault: B, vaultCollateralRatioBIPS: 40_000n });
    const c = agent({ agentVault: C, vaultCollateralRatioBIPS: 20_000n });

    const forward = rankAgents(state([a, b, c]), 100n * UNIT);
    const reversed = rankAgents(state([c, b, a]), 100n * UNIT);

    expect(forward.agents.map((x) => x.snapshot.agentVault)).toEqual(
      reversed.agents.map((x) => x.snapshot.agentVault),
    );
    expect(buildSnapshotCommitment(forward).snapshotHash).toBe(
      buildSnapshotCommitment(reversed).snapshotHash,
    );
  });

  it("breaks a saturated score tie on real headroom, not on address", () => {
    // Both saturate the score; A is alphabetically first but B is safer.
    const a = agent({ agentVault: A, vaultCollateralRatioBIPS: 30_000n, poolCollateralRatioBIPS: 40_000n });
    const b = agent({ agentVault: B, vaultCollateralRatioBIPS: 90_000n, poolCollateralRatioBIPS: 90_000n });
    const r = rankAgents(state([a, b]), 10n * UNIT);
    expect(r.agents[0].score).toBeCloseTo(r.agents[1].score, 12);
    expect(r.recommended!.snapshot.agentVault).toBe(B);
  });

  it("rejects a non-positive mint amount", () => {
    expect(() => rankAgents(state([agent({ agentVault: A })]), 0n)).toThrow();
    expect(() => rankAgents(state([agent({ agentVault: A })]), -1n)).toThrow();
  });

  it("charges the fee on the requested amount", () => {
    const r = rankAgents(state([agent({ agentVault: A, feeBIPS: 25n })]), 1_000n * UNIT);
    // 0.25% of 1000 FXRP = 2.5 FXRP
    expect(r.agents[0].feeAmountUBA).toBe(2_500_000n);
  });

  it("returns no recommendation when every agent is too small", () => {
    const r = rankAgents(
      state([agent({ agentVault: A, availableCapacityUBA: 1n * UNIT })]),
      10_000n * UNIT,
    );
    expect(r.recommended).toBeUndefined();
    expect(explainRecommendation(r).kind).toBe("no_eligible_agents");
  });
});

describe("explainRecommendation", () => {
  it("explains a genuine fee-vs-safety trade-off from the real numbers", () => {
    const safe = agent({
      agentVault: A,
      feeBIPS: 30n,
      vaultCollateralRatioBIPS: 60_000n,
      poolCollateralRatioBIPS: 60_000n,
    });
    const thin = agent({
      agentVault: B,
      feeBIPS: 25n,
      vaultCollateralRatioBIPS: 14_000n,
      poolCollateralRatioBIPS: 20_000n,
    });
    const c = explainRecommendation(rankAgents(state([safe, thin]), 100n * UNIT));
    expect(c.kind).toBe("trade_off");
    expect(c.feeDeltaBIPS).toBe(5n);
    expect(c.headroomDeltaBIPS!).toBeGreaterThan(0n);
    expect(c.headline).toContain("0.05%");
  });

  it("states plainly when there is no fee spread to trade against", () => {
    const strong = agent({ agentVault: A, vaultCollateralRatioBIPS: 90_000n, poolCollateralRatioBIPS: 90_000n });
    const weak = agent({ agentVault: B, vaultCollateralRatioBIPS: 14_000n, poolCollateralRatioBIPS: 20_000n });
    const c = explainRecommendation(rankAgents(state([strong, weak]), 100n * UNIT));
    expect(c.kind).toBe("no_fee_spread");
    expect(c.feeDeltaBIPS).toBe(0n);
    expect(c.headline).toContain("same");
  });
});

describe("snapshot commitment", () => {
  it("produces a stable hash for identical inputs", () => {
    const r = rankAgents(state([agent({ agentVault: A }), agent({ agentVault: B })]), 500n * UNIT);
    expect(buildSnapshotCommitment(r).snapshotHash).toBe(
      buildSnapshotCommitment(r).snapshotHash,
    );
  });

  it("changes when the mint amount changes", () => {
    const s = state([agent({ agentVault: A })]);
    expect(buildSnapshotCommitment(rankAgents(s, 100n * UNIT)).snapshotHash).not.toBe(
      buildSnapshotCommitment(rankAgents(s, 101n * UNIT)).snapshotHash,
    );
  });

  it("changes when any agent metric changes", () => {
    const base = buildSnapshotCommitment(
      rankAgents(state([agent({ agentVault: A, feeBIPS: 25n })]), 100n * UNIT),
    );
    const moved = buildSnapshotCommitment(
      rankAgents(state([agent({ agentVault: A, feeBIPS: 26n })]), 100n * UNIT),
    );
    expect(base.snapshotHash).not.toBe(moved.snapshotHash);
  });

  it("changes when the block number changes", () => {
    const s1 = state([agent({ agentVault: A })]);
    const s2 = { ...s1, blockNumber: s1.blockNumber + 1n };
    expect(buildSnapshotCommitment(rankAgents(s1, 100n * UNIT)).snapshotHash).not.toBe(
      buildSnapshotCommitment(rankAgents(s2, 100n * UNIT)).snapshotHash,
    );
  });

  it("encodes negative headroom without underflowing the uint256 offset", () => {
    const breaching = agent({
      agentVault: A,
      vaultCollateralRatioBIPS: 12_100n,
      poolCollateralRatioBIPS: 60_000n,
      mintedUBA: 1_000n * UNIT,
    });
    const c = buildSnapshotCommitment(rankAgents(state([breaching]), 1_000n * UNIT));
    expect(c.snapshotHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c.agentCount).toBe(1);
  });

  it("commits to the agent count and the block it was taken at", () => {
    const r = rankAgents(state([agent({ agentVault: A }), agent({ agentVault: B })]), 100n * UNIT);
    const c = buildSnapshotCommitment(r);
    expect(c.agentCount).toBe(2);
    expect(c.blockNumber).toBe(1_000n);
    expect(c.chainId).toBe(114);
  });
});
