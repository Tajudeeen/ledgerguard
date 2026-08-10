import type { AgentTrail } from "@/lib/attestation/trail";
import { headroom, shortAddress } from "@/lib/utils/format";

function stabilityTier(score: number): { label: string; className: string } {
  if (score >= 0.75) return { label: "STABLE", className: "text-[var(--color-good)]" };
  if (score >= 0.5) return { label: "STEADY", className: "text-[var(--color-warn)]" };
  if (score >= 0.25) return { label: "VARIABLE", className: "text-[var(--color-warn)]" };
  return { label: "UNPROVEN", className: "text-[var(--color-faint)]" };
}

/** A horizontal strip of relative-projected-headroom dots — the agent's history. */
function HistoryStrip({ trail }: { trail: AgentTrail }) {
  const width = 140;
  const n = trail.points.length;
  return (
    <div className="flex items-center gap-1" style={{ width }} title={`${n} observations`}>
      {trail.points.map((p) => {
        const rel = p.projectedHeadroomBIPS
          ? Number(BigInt(p.projectedHeadroomBIPS)) / Number(BigInt(p.liquidationThresholdBIPS || "1"))
          : null;
        const color =
          rel === null
            ? "var(--color-faint)"
            : rel <= 0
              ? "var(--color-bad)"
              : rel < 0.2
                ? "var(--color-warn)"
                : "var(--color-good)";
        return (
          <span
            key={p.attestationId}
            className="h-4 flex-1 rounded-sm"
            style={{ background: color, minWidth: 4 }}
            title={`#${p.attestationId} block ${p.blockNumber}: headroom ${headroom(p.projectedHeadroomBIPS)}`}
          />
        );
      })}
      {Array.from({ length: Math.max(0, 12 - n) }).map((_, i) => (
        <span key={`pad-${i}`} className="h-4 flex-1 rounded-sm bg-[var(--color-surface-2)]" style={{ minWidth: 4 }} />
      ))}
    </div>
  );
}

/** Overview table of every tracked agent and its stability summary. */
export function TrailList({ trails }: { trails: AgentTrail[] }) {
  if (trails.length === 0) {
    return (
      <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
        No attestations recorded yet. Anchor a ranking, or run the trail worker,
        to start the verifiable history.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
            <th className="px-3 py-2.5 font-medium">Agent</th>
            <th className="px-3 py-2.5 font-medium text-right">Stability</th>
            <th className="px-3 py-2.5 font-medium">History</th>
            <th className="px-3 py-2.5 font-medium text-right">Obs.</th>
            <th className="px-3 py-2.5 font-medium text-right">Recommended</th>
            <th className="px-3 py-2.5 font-medium text-right">Worst headroom</th>
            <th className="px-3 py-2.5 font-medium text-right">Best headroom</th>
          </tr>
        </thead>
        <tbody>
          {trails.map((t) => {
            const tier = stabilityTier(t.stabilityScore);
            return (
              <tr key={t.agentVault} className="border-b border-[var(--color-line)]">
                <td className="num px-3 py-3">
                  <a
                    href={`/agent/${t.agentVault}`}
                    className="text-[var(--color-accent)] hover:underline"
                  >
                    {shortAddress(t.agentVault)}
                  </a>
                </td>
                <td className={`num px-3 py-3 text-right ${tier.className}`}>
                  <span className="text-[11px] font-medium tracking-wide">{tier.label}</span>
                  <span className="ml-2 text-[var(--color-muted)]">
                    {t.stabilityScore.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <HistoryStrip trail={t} />
                </td>
                <td className="num px-3 py-3 text-right text-[var(--color-muted)]">
                  {t.observations}
                </td>
                <td className="num px-3 py-3 text-right text-[var(--color-muted)]">
                  {t.timesRecommended}/{t.observations}
                </td>
                <td className="num px-3 py-3 text-right text-[var(--color-muted)]">
                  {headroom(
                    t.minRelativeHeadroom === 0 && t.observations === 0
                      ? null
                      : relativeBips(t, "min"),
                  )}
                </td>
                <td className="num px-3 py-3 text-right text-[var(--color-muted)]">
                  {headroom(
                    t.maxRelativeHeadroom === 0 && t.observations === 0
                      ? null
                      : relativeBips(t, "max"),
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Reconstructs a synthetic BIPS string so headroom() can display worst/best. */
function relativeBips(t: AgentTrail, which: "min" | "max"): string | null {
  const rel = which === "min" ? t.minRelativeHeadroom : t.maxRelativeHeadroom;
  if (rel === 0 && t.observations === 0) return null;
  // relative * liquidationThreshold * HEADROOM_SATURATION(1.0) ~ headroom BIPS.
  // Use a representative liquidation threshold (vault 12000 BIPS) for display.
  return BigInt(Math.round(rel * 12_000)).toString();
}
