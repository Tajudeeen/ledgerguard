import { isAddress } from "viem";
import { describe, expect, it } from "vitest";

import { readFxrpAgentSnapshots } from "../lib/fassets/fxrp-agent-reader";

describe("Coston2 FXRP agent reader", () => {
  it(
    "resolves AssetManagerFXRP through the registry and returns a live normalized snapshot list",
    async () => {
      const result = await readFxrpAgentSnapshots();

      expect(isAddress(result.assetManager)).toBe(true);
      expect(result.blockNumber).toBeGreaterThan(0n);
      expect(result.lotSizeAMG).toBeGreaterThan(0n);
      expect(result.assetMintingGranularityUBA).toBeGreaterThan(0n);
      expect(Array.isArray(result.snapshots)).toBe(true);
      expect(result.snapshots.length).toBeGreaterThan(0);

      for (const snapshot of result.snapshots) {
        expect(isAddress(snapshot.agentVault)).toBe(true);
        expect(snapshot.availableCapacityUBA).toBe(
          snapshot.freeCollateralLots *
            result.lotSizeAMG *
            result.assetMintingGranularityUBA,
        );
      }
    },
    60_000,
  );
});
