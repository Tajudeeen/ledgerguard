import { describe, expect, it } from "vitest";

import { applyShock, formatShock, stressSnapshot } from "../lib/scoring/stress";
import type { AgentSnapshot } from "../lib/types/agent";

describe("applyShock", () => {
  it("drops the ratio by the shock fraction", () => {
    // 20000 BIPS (2.0x) with a -30% shock => 14000 BIPS (1.4x)
    expect(applyShock(20000n, -3000)).toBe(14000n);
  });

  it("increases the ratio on a positive shock", () => {
    expect(applyShock(20000n, 1000)).toBe(22000n);
  });

  it("is a no-op at zero shock", () => {
    expect(applyShock(20000n, 0)).toBe(20000n);
  });

  it("floors at zero for a deeper-than-100% drop", () => {
    expect(applyShock(20000n, -10000)).toBe(0n);
  });

  it("does not go negative", () => {
    expect(applyShock(20000n, -20000)).toBe(0n);
  });

  it("leaves a zero ratio untouched", () => {
    expect(applyShock(0n, -5000)).toBe(0n);
  });

  it("rounds without overflow on large ratios", () => {
    expect(applyShock(2_000_000n, -2500)).toBe(1_500_000n);
  });
});

describe("formatShock", () => {
  it("renders signed percentages", () => {
    expect(formatShock(-3000)).toBe("-30%");
    expect(formatShock(1000)).toBe("+10%");
    expect(formatShock(0)).toBe("0%");
  });
});

describe("stressSnapshot", () => {
  const base: AgentSnapshot = {
    agentVault: "0xaaa",
    ownerManagementAddress: "0xbbb",
    status: 0,
    feeBIPS: 2500n,
    freeCollateralLots: 1n,
    availableCapacityUBA: 1n,
    vaultCollateralToken: "0xv",
    vaultCollateralRatioBIPS: 20000n,
    totalVaultCollateralWei: 1n,
    poolWNatToken: "0xp",
    poolCollateralRatioBIPS: 25000n,
    totalPoolCollateralNATWei: 1n,
    mintedUBA: 1n,
    reservedUBA: 0n,
    redeemingUBA: 0n,
    poolRedeemingUBA: 0n,
  };

  it("scales both legs by the shock", () => {
    const s = stressSnapshot(base, -3000);
    expect(s.vaultCollateralRatioBIPS).toBe(14000n);
    expect(s.poolCollateralRatioBIPS).toBe(17500n);
  });

  it("returns the input unchanged at zero shock", () => {
    expect(stressSnapshot(base, 0)).toBe(base);
  });

  it("does not mutate the original", () => {
    const before = base.vaultCollateralRatioBIPS;
    stressSnapshot(base, -3000);
    expect(base.vaultCollateralRatioBIPS).toBe(before);
  });
});
