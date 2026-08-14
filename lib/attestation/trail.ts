import type { RankingView } from "../utils/view";

/**
 * The trail turns the append-only stream of ranking attestations on Coston2
 * into a verifiable, dated history of what each FXRP agent was - and how it
 * moved.
 *
 * Design: the contract stores the *commitment* (hash + block + recommended
 * agent + submitter). The full ranking per attestation is kept in the receipt
 * cache (written at attest time, see lib/utils/receipt-store.ts). We therefore
 * reconstruct each agent's state for a given attestation by looking it up in
 * that attestation's cached ranking.
 *
 * This is honest about its source: a trail point is "what LedgerGuard recorded
 * in attestation N at block B", not "what the chain provably showed at B" -
 * although anyone can take attestation N's snapshot block, re-run the engine
 * (script/reproduce.ts), and check the cached ranking matches, which is what
 * the receipt page already does. The cache is convenience; the chain is the
 * arbiter, and the hash makes the two reconcilable.
 */

export type TrailPoint = {
  attestationId: number;
  blockNumber: number;
  attestedAtMs: number;
  snapshotHash: string;
  /** null when the agent was not part of this attestation's agent set. */
  present: boolean;
  eligible: boolean | null;
  rank: number | null;
  feeBIPS: string | null;
  projectedHeadroomBIPS: string | null;
  projectedRatioBIPS: string | null;
  liquidationThresholdBIPS: string | null;
  bindingLegLabel: "vault" | "pool" | null;
  score: number | null;
  recommended: boolean;
};

export type AgentTrail = {
  agentVault: string;
  points: TrailPoint[];
  /** Distinct blocks at which the agent was observed. */
  observations: number;
  /** Attestations in which the agent was eligible. */
  eligibleObservations: number;
  /** Attestations in which the agent was the recommended pick. */
  timesRecommended: number;
  /**
   * Transparent stability score in [0,1].
   *
   *   consistency = mean(projectedHeadroomBIPS) normalised relative to the
   *                 agent's own liquidation threshold
   *   reliability = eligibleObservations / observations  (did it stay usable?)
   *   trust       = blend, weighted toward consistency
   *
   * No black box: every term is shown on the agent page. The score describes
   * how *stable and healthy* an agent has been across the recorded window - it
   * is not a guarantee about the future and is not part of the per-mint score.
   */
  stabilityScore: number;
  stabilityComponents: {
    averageProjectedHeadroom: number; // relative, [0,1] after saturation
    availability: number; // eligibleObservations / observations
    recommendedShare: number; // timesRecommended / observations
  };
  /** Lowest projected headroom seen (most exposed moment), relative. */
  minRelativeHeadroom: number;
  /** Highest projected headroom seen, relative. */
  maxRelativeHeadroom: number;
  /** Whether the agent ever dropped to/below liquidation in the window. */
  everBreached: boolean;
};

export type AttestationRecord = {
  id: number;
  snapshotHash: string;
  snapshotBlock: number;
  attestedAtMs: number;
  agentCount: number;
  mintAmountUBA: string;
  recommendedAgent: string;
  submitter: string;
};

/** Headroom saturation: relative headroom >= 1.0 (i.e. ratio 2x threshold) is "fully comfortable". */
const HEADROOM_SATURATION = 1.0;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Relative projected headroom for one trail point, or null when unknown. */
function relativeProjectedHeadroom(p: TrailPoint): number | null {
  if (p.projectedHeadroomBIPS === null || p.liquidationThresholdBIPS === null) {
    return null;
  }
  const h = BigInt(p.projectedHeadroomBIPS);
  const liq = BigInt(p.liquidationThresholdBIPS);
  if (liq <= 0n) return null;
  if (h < 0n) return 0;
  return clamp01(Number(h) / Number(liq) / HEADROOM_SATURATION);
}

/**
 * Builds per-agent trails from the attestation records plus a lookup that
 * returns the cached ranking view for a given attestation id (may be async and
 * may return null). Pure aside from the injected lookup.
 */
export async function buildTrails(
  records: AttestationRecord[],
  rankingFor: (id: number) => Promise<RankingView | null> | RankingView | null,
): Promise<AgentTrail[]> {
  // oldest-first
  const ordered = [...records].sort((a, b) => a.id - b.id);

  const byAgent = new Map<string, TrailPoint[]>();

  for (const rec of ordered) {
    const view = await rankingFor(rec.id);
    if (!view) continue;

    for (const agent of view.agents) {
      const point: TrailPoint = {
        attestationId: rec.id,
        blockNumber: rec.snapshotBlock,
        attestedAtMs: rec.attestedAtMs,
        snapshotHash: rec.snapshotHash,
        present: true,
        eligible: agent.eligible,
        rank: agent.rank,
        feeBIPS: agent.feeBIPS,
        projectedHeadroomBIPS: agent.bindingLeg.projectedHeadroomBIPS,
        projectedRatioBIPS: agent.bindingLeg.projectedRatioBIPS,
        liquidationThresholdBIPS: agent.bindingLeg.liquidationThresholdBIPS,
        bindingLegLabel:
          agent.bindingLeg.label === "vault" || agent.bindingLeg.label === "pool"
            ? agent.bindingLeg.label
            : null,
        score: agent.score,
        recommended: agent.agentVault === view.recommendedVault,
      };
      if (!byAgent.has(agent.agentVault)) byAgent.set(agent.agentVault, []);
      byAgent.get(agent.agentVault)!.push(point);
    }
  }

  const trails: AgentTrail[] = [];

  for (const [vault, points] of byAgent) {
    const relative = points
      .map(relativeProjectedHeadroom)
      .filter((x): x is number => x !== null);

    const avg = relative.reduce((s, x) => s + x, 0) / (relative.length || 1);
    const eligible = points.filter((p) => p.eligible).length;
    const recommended = points.filter((p) => p.recommended).length;
    const observations = points.length;

    const minRel = relative.length ? Math.min(...relative) : 0;
    const maxRel = relative.length ? Math.max(...relative) : 0;

    const everBreached = points.some((p) => {
      const r = relativeProjectedHeadroom(p);
      return r !== null && r <= 0;
    });

    const availability = observations === 0 ? 0 : eligible / observations;

    // trust: consistency dominates, availability matters, recommendation is a
    // mild bonus. All terms in [0,1]; explicit weights summing to 1.
    const stabilityScore =
      avg * 0.6 + availability * 0.3 + (recommended / observations) * 0.1;

    trails.push({
      agentVault: vault,
      points,
      observations,
      eligibleObservations: eligible,
      timesRecommended: recommended,
      stabilityScore,
      stabilityComponents: {
        averageProjectedHeadroom: avg,
        availability,
        recommendedShare: observations === 0 ? 0 : recommended / observations,
      },
      minRelativeHeadroom: minRel,
      maxRelativeHeadroom: maxRel,
      everBreached,
    });
  }

  // Rank agents by stability, then by observations, then address.
  trails.sort((a, b) => {
    if (b.stabilityScore !== a.stabilityScore) {
      return b.stabilityScore - a.stabilityScore;
    }
    if (b.observations !== a.observations) return b.observations - a.observations;
    return a.agentVault.toLowerCase() < b.agentVault.toLowerCase() ? -1 : 1;
  });

  return trails;
}

/**
 * Reads all attestation records from the deployed contract, oldest to newest.
 * Returns [] when no contract is configured or the read fails.
 *
 * Accepts a viem public client (loosely typed to avoid generic friction); the
 * internal casts are safe because we only read `count` and `get`.
 */
export async function readAttestationRecords(
  client: { readContract: (args: Record<string, unknown>) => Promise<unknown> },
  contractAddress: string,
  abi: readonly unknown[],
): Promise<AttestationRecord[]> {
  try {
    const count = Number(
      await client.readContract({
        address: contractAddress,
        abi,
        functionName: "count",
        args: [],
      }),
    );

    const records: AttestationRecord[] = [];
    for (let id = 0; id < count; id++) {
      const rec = (await client.readContract({
        address: contractAddress,
        abi,
        functionName: "get",
        args: [BigInt(id)],
      })) as {
        snapshotHash: string;
        snapshotBlock: bigint;
        attestedAt: bigint;
        agentCount: number;
        mintAmountUBA: bigint;
        recommendedAgent: string;
        submitter: string;
      };

      records.push({
        id,
        snapshotHash: rec.snapshotHash,
        snapshotBlock: Number(rec.snapshotBlock),
        attestedAtMs: Number(rec.attestedAt) * 1000,
        agentCount: rec.agentCount,
        mintAmountUBA: rec.mintAmountUBA.toString(),
        recommendedAgent: rec.recommendedAgent,
        submitter: rec.submitter,
      });
    }
    return records;
  } catch {
    return [];
  }
}
