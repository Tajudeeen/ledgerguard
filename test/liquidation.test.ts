import { describe, expect, it } from "vitest";

import {
  byRobustness,
  formatMove,
  liquidationMoveBips,
  liquidationPriceUsd,
} from "../lib/scoring/liquidation";
import type { AgentView } from "../lib/utils/view";

function agent(over: Partial<Record<string, unknown>> = {}) {
  return {
    rank: 1,
    agentVault: "0xaaa",
    eligible: true,
    ineligibilityReasons: [],
    feeBIPS: "25",
    feeAmountUBA: "125",
    score: 1,
    components: { projectedHeadroom: 1, currentHealth: 1, capacityBuffer: 1, fee: 1 },
    bindingLeg: {
      label: "vault" as const,
      tokenSymbol: "testUSDT",
      currentRatioBIPS: "20000",
      projectedRatioBIPS: "15000",
      liquidationThresholdBIPS: "15000",
      safetyThresholdBIPS: "13000",
      currentHeadroomBIPS: "8000",
      projectedHeadroomBIPS: "3000",
    },
    vaultLeg: {} as never,
    poolLeg: {} as never,
    availableCapacityUBA: "1",
    capacityAfterMintUBA: "1",
    backedBeforeUBA: "1",
    shareOfBackingPct: 25,
    liquidationMoveBips: "0",
    ...over,
  } as unknown as AgentView;
}

describe("liquidationMoveBips", () => {
  it("computes the drawdown to breach (2.0x -> 1.5x liq = -25%)", () => {
    expect(liquidationMoveBips(agent())).toBe(-2500n);
  });

  it("is steeper when closer to liquidation (1.6x -> 1.5x = -6.25%)", () => {
    const a = agent({ bindingLeg: { ...agent().bindingLeg, currentRatioBIPS: "16000" } });
    expect(liquidationMoveBips(a)).toBe(-625n);
  });

  it("returns 0 when already at or below liquidation", () => {
    const a = agent({
      bindingLeg: { ...agent().bindingLeg, currentRatioBIPS: "15000" },
    });
    expect(liquidationMoveBips(a)).toBe(0n);
  });

  it("handles zero current ratio without dividing by zero", () => {
    const a = agent({ bindingLeg: { ...agent().bindingLeg, currentRatioBIPS: "0" } });
    expect(liquidationMoveBips(a)).toBe(0n);
  });
});

describe("formatMove", () => {
  it("renders signed percentages", () => {
    expect(formatMove(-2500n)).toBe("-25.0%");
    expect(formatMove(0n)).toBe("0.0%");
  });
});

describe("liquidationPriceUsd", () => {
  it("anchors the move to the live XRP price", () => {
    // move -25% from $0.20 => $0.15
    expect(liquidationPriceUsd(agent(), 0.2)).toBeCloseTo(0.15, 5);
  });
  it("returns null when price unknown", () => {
    expect(liquidationPriceUsd(agent(), null)).toBeNull();
  });
});

describe("byRobustness", () => {
  it("ranks the deeper-drawdown survivor first", () => {
    const safe = agent({
      agentVault: "0xsafe",
      bindingLeg: { ...agent().bindingLeg, currentRatioBIPS: "30000" },
    });
    const fragile = agent({
      agentVault: "0xfrag",
      bindingLeg: { ...agent().bindingLeg, currentRatioBIPS: "16000" },
    });
    const sorted = byRobustness([fragile, safe]);
    expect(sorted[0].agentVault).toBe("0xsafe");
  });
});
