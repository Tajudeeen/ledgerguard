import { describe, expect, it } from "vitest";

import { liquidationPriceUsd, liquidationMoveBips } from "../lib/scoring/liquidation";
import type { AgentView } from "../lib/utils/view";

function agent(over: Partial<Record<string, unknown>> = {}) {
  return {
    rank: 1,
    agentVault: "0xaaa",
    bindingLeg: {
      label: "vault" as const,
      currentRatioBIPS: "20000",
      liquidationThresholdBIPS: "15000",
    },
    ...over,
  } as unknown as AgentView;
}

describe("BreachCascade math (FTSO-driven liquidation price)", () => {
  it("computes the absolute liquidation price from a live XRP price", () => {
    // move -25% from $0.20 => $0.15
    expect(liquidationPriceUsd(agent(), 0.2)).toBeCloseTo(0.15, 5);
  });

  it("returns null when no price is available", () => {
    expect(liquidationPriceUsd(agent(), null)).toBeNull();
  });

  it("deeper liquidation move => lower liquidation price", () => {
    const safe = agent({ bindingLeg: { label: "vault" as const, currentRatioBIPS: "30000", liquidationThresholdBIPS: "15000" } });
    const fragile = agent({ bindingLeg: { label: "vault" as const, currentRatioBIPS: "16000", liquidationThresholdBIPS: "15000" } });
    expect(liquidationPriceUsd(safe, 0.2)!).toBeLessThan(liquidationPriceUsd(fragile, 0.2)!);
  });

  it("moveBips sign is negative (price must fall)", () => {
    expect(liquidationMoveBips(agent()) < 0n).toBe(true);
  });
});
