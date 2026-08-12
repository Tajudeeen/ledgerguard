import type { RankingView } from "@/lib/utils/view";
import { fxrp } from "@/lib/utils/format";

/**
 * System-level concentration. Deliberately presented apart from agent risk:
 * HHI describes the FXRP system, not whether any one agent is safe for you.
 */
export function ConcentrationPanel({ view }: { view: RankingView }) {
  const { hhi, minPossibleHhi, totalBackedUBA, agentCount } = view.concentration;
  const spread = hhi <= 0 ? 0 : minPossibleHhi / hhi; // 1.0 = perfectly even

  const band =
    hhi >= 0.25
      ? { label: "CONCENTRATED", className: "text-[var(--color-warn)]" }
      : hhi >= 0.15
        ? { label: "MODERATE", className: "text-[var(--color-muted)]" }
        : { label: "DISPERSED", className: "text-[var(--color-good)]" };

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          System concentration (HHI)
        </span>
        <span className={`text-[11px] tracking-wide ${band.className}`}>{band.label}</span>
      </div>

      <div className="num mt-3 text-3xl">{hhi.toFixed(4)}</div>
      <div className="mt-1 text-xs text-[var(--color-muted)]">
        lowest possible with {agentCount} agents: <span className="num">{minPossibleHhi.toFixed(4)}</span>
        {" · "}evenness <span className="num">{(spread * 100).toFixed(0)}%</span>
      </div>

      <div className="mt-4 space-y-1.5">
        {view.agents.map((a) => (
          <div key={a.agentVault} className="flex items-center gap-2">
            <span className="num w-16 shrink-0 text-[11px] text-[var(--color-faint)]">
              {a.agentVault.slice(0, 6)}
            </span>
            <div className="h-1.5 flex-1 bg-[var(--color-surface-2)]">
              <div
                className={`h-full ${
                  a.agentVault === view.recommendedVault
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-line-bright)]"
                }`}
                style={{ width: `${a.shareOfBackingPct}%` }}
              />
            </div>
            <span className="num w-12 shrink-0 text-right text-[11px] text-[var(--color-muted)]">
              {a.shareOfBackingPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Total FXRP backed across available agents:{" "}
        <span className="num">{fxrp(totalBackedUBA, view.assetUnitUBA)}</span>. HHI is
        the sum of squared exposure shares. It measures how concentrated the
        system is — it is reported as context and is not a term in any agent&apos;s
        safety score. With only {agentCount} live agents the theoretical floor is{" "}
        <span className="num">{minPossibleHhi.toFixed(4)}</span>, so on Coston2 a
        &ldquo;concentrated&rdquo; reading mostly reflects how few agents exist, not
        a quality verdict on any one of them.
      </p>
    </div>
  );
}
