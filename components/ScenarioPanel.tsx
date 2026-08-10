import {
  byRobustness,
  formatMove,
  liquidationMoveBips,
  liquidationPriceUsd,
} from "@/lib/scoring/liquidation";
import { formatShock } from "@/lib/scoring/stress";
import type { OracleView, RankingView } from "@/lib/utils/view";

/**
 * The crash scenario: FTSO-aware and the heart of the 30-second story.
 *
 * For each agent we show how far XRP can fall before it breaches its binding
 * liquidation threshold (derived from on-chain ratios, exact). When the live
 * FTSO XRP/USD price is available we also express that as an absolute dollar
 * target. This is what makes the recommendation defensible under volatility:
 * "Agent X survives a −37% crash; the weakest agent dies at −11%."
 */
export function ScenarioPanel({
  view,
  oracle,
}: {
  view: RankingView;
  oracle: OracleView | null;
}) {
  const sorted = byRobustness(view.agents);
  const xrpUsd = oracle?.fresh ? oracle.priceUsd : null;
  const recommended = view.recommendedVault;

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Crash scenario — how far can XRP fall?
        </h3>
        {xrpUsd !== null ? (
          <span className="num text-[11px] text-[var(--color-muted)]">
            FTSO XRP/USD ${xrpUsd.toFixed(4)}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--color-faint)]">
            oracle-independent — derived from on-chain ratios
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Each bar is the XRP drawdown an agent can absorb before its collateral
        ratio hits liquidation. Longer is safer. Computed from on-chain ratios —
        no oracle required.
      </p>

      <div className="mt-4 space-y-2.5">
        {sorted.map((a) => {
          const move = liquidationMoveBips(a);
          const pct = Number(move) / 100;
          const liqPrice = liquidationPriceUsd(a, xrpUsd);
          // bar width: map -60%..0% to 8%..100%
          const width = Math.max(8, Math.min(100, 100 + (pct / 0.6) * 92));
          const isRec = a.agentVault === recommended;
          const fragile = pct > -0.15; // breaches before a 15% drop
          const color = fragile
            ? "var(--color-bad)"
            : pct > -0.3
              ? "var(--color-warn)"
              : "var(--color-good)";
          return (
            <div key={a.agentVault} className="flex items-center gap-3">
              <span className="num w-16 shrink-0 text-[11px] text-[var(--color-muted)]">
                {a.agentVault.slice(0, 6)}…
              </span>
              <div className="relative h-3 flex-1 bg-[var(--color-surface-2)]">
                <div
                  className="h-3 rounded-sm"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
              <span
                className={`num w-24 shrink-0 text-right text-[11px] ${
                  isRec ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"
                }`}
              >
                {formatMove(move)}
                {liqPrice !== null && (
                  <span className="text-[var(--color-faint)]"> · ${liqPrice.toFixed(3)}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Want a specific shock? Use the price-shock control above — it re-ranks
        every agent live. {view.whatIfShockBips !== 0 && (
          <span className="text-[var(--color-warn)]">
            Currently showing XRP {formatShock(view.whatIfShockBips)}.
          </span>
        )}
      </p>
    </div>
  );
}
