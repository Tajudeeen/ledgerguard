import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";

import type { Ranking } from "../scoring/rank-agents";

/**
 * LedgerGuard snapshot commitment, format version 1.
 *
 * Requirements this satisfies:
 *  - Deterministic: identical chain state + identical mint amount => identical
 *    hash, on any machine, in any process.
 *  - No JSON: JSON key ordering and number formatting are not stable across
 *    implementations. The commitment is ABI-encoded instead, which has an
 *    exact, language-independent byte layout.
 *  - Reconstructible: the encoded tuple contains everything a third party needs
 *    to re-derive the ranking from an archive node at `blockNumber`.
 *
 * Encoding (abi.encode, in this exact order):
 *
 *   string  version        "LEDGERGUARD-V1"
 *   uint256 chainId        114 for Coston2
 *   address assetManager   resolved via the Flare Contract Registry
 *   string  asset          "FXRP"
 *   uint256 blockNumber    block every read was pinned to
 *   uint256 blockTimestamp timestamp of that block
 *   uint256 mintAmountUBA  the amount the ranking answers for
 *   Agent[] agents         sorted ASCENDING by agentVault address
 *
 * Agent tuple:
 *   address agentVault
 *   uint16  rank                   1 = recommended
 *   bool    eligible
 *   uint256 feeBIPS
 *   uint256 vaultCRBIPS            current vault collateral ratio
 *   uint256 poolCRBIPS             current pool collateral ratio
 *   uint256 projectedVaultCRBIPS   0 when unmeasurable
 *   uint256 projectedPoolCRBIPS    0 when unmeasurable
 *   uint256 bindingHeadroomBIPS    int-shifted: see HEADROOM_OFFSET
 *   uint256 availableCapacityUBA
 *   uint256 backedBeforeUBA
 *   uint256 scoreE18               score * 1e18, floored
 *
 * The hash is keccak256 of that encoding.
 */
export const SNAPSHOT_VERSION = "LEDGERGUARD-V1" as const;
export const ASSET_SYMBOL = "FXRP" as const;

/**
 * Headroom can be negative but the commitment uses uint256 for uniform
 * encoding, so values are stored offset by 2^128. Decoders subtract it back.
 */
export const HEADROOM_OFFSET = 2n ** 128n;

const SNAPSHOT_ABI = parseAbiParameters(
  "string version, uint256 chainId, address assetManager, string asset, " +
    "uint256 blockNumber, uint256 blockTimestamp, uint256 mintAmountUBA, " +
    "(address agentVault, uint16 rank, bool eligible, uint256 feeBIPS, " +
    "uint256 vaultCRBIPS, uint256 poolCRBIPS, uint256 projectedVaultCRBIPS, " +
    "uint256 projectedPoolCRBIPS, uint256 bindingHeadroomOffsetBIPS, " +
    "uint256 availableCapacityUBA, uint256 backedBeforeUBA, uint256 scoreE18)[] agents",
);

export type SnapshotCommitment = {
  version: typeof SNAPSHOT_VERSION;
  encoded: Hex;
  snapshotHash: Hex;
  chainId: number;
  assetManager: `0x${string}`;
  blockNumber: bigint;
  blockTimestamp: bigint;
  mintAmountUBA: bigint;
  agentCount: number;
};

function scoreToE18(score: number): bigint {
  // Floor to keep the mapping total and reproducible across float printers.
  return BigInt(Math.floor(score * 1e18));
}

export function buildSnapshotCommitment(ranking: Ranking): SnapshotCommitment {
  // Canonical order: ascending by vault address. Rank is carried as a field,
  // so ordering never depends on the score's floating-point comparison.
  const agents = [...ranking.agents]
    .sort((a, b) =>
      a.snapshot.agentVault.toLowerCase() < b.snapshot.agentVault.toLowerCase()
        ? -1
        : 1,
    )
    .map((agent) => ({
      agentVault: agent.snapshot.agentVault,
      rank: agent.rank,
      eligible: agent.eligible,
      feeBIPS: agent.feeBIPS,
      vaultCRBIPS: agent.vaultLeg.currentRatioBIPS,
      poolCRBIPS: agent.poolLeg.currentRatioBIPS,
      projectedVaultCRBIPS: agent.vaultLeg.projectedRatioBIPS ?? 0n,
      projectedPoolCRBIPS: agent.poolLeg.projectedRatioBIPS ?? 0n,
      bindingHeadroomOffsetBIPS:
        HEADROOM_OFFSET + (agent.bindingLeg.projectedHeadroomBIPS ?? 0n),
      availableCapacityUBA: agent.availableCapacityUBA,
      backedBeforeUBA: agent.backedBeforeUBA,
      scoreE18: scoreToE18(agent.score),
    }));

  const encoded = encodeAbiParameters(SNAPSHOT_ABI, [
    SNAPSHOT_VERSION,
    BigInt(ranking.chainId),
    ranking.assetManager as `0x${string}`,
    ASSET_SYMBOL,
    ranking.blockNumber,
    ranking.blockTimestamp,
    ranking.mintAmountUBA,
    agents,
  ]);

  return {
    version: SNAPSHOT_VERSION,
    encoded,
    snapshotHash: keccak256(encoded),
    chainId: ranking.chainId,
    assetManager: ranking.assetManager as `0x${string}`,
    blockNumber: ranking.blockNumber,
    blockTimestamp: ranking.blockTimestamp,
    mintAmountUBA: ranking.mintAmountUBA,
    agentCount: agents.length,
  };
}
