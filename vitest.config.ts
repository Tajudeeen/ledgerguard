import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    // Scoring-engine tests run as pure Node (no browser/jsdom) for speed + determinism.
    environment: "node",
    include: ["test/scoring.test.ts", "test/trail.test.ts", "test/stress.test.ts", "test/liquidation.test.ts", "test/breach-cascade.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text-summary", "text"],
      // The scoring engine lives under lib/scoring + the attestation/headroom math it depends on.
      include: [
        "lib/scoring/**",
        "lib/attestation/snapshot-hash.ts",
        "lib/attestation/trail.ts",
      ],
      // fxrp-agent-reader.ts is the live-chain reader; it is exercised by the
      // coston2-reader integration test, not the offline scoring suite. Exclude
      // it so the reported percentage reflects code the unit suite actually covers.
      exclude: ["lib/fassets/fxrp-agent-reader.ts", "**/*.d.ts", "**/node_modules/**"],
    },
  },
});
