"use client";

import { useMemo, useState } from "react";

import {
  byRobustness,
  liquidationPriceUsd,
} from "@/lib/scoring/liquidation";
import type { OracleView, RankingView } from "@/lib/utils/view";

/**
 * FTSO-driven breach cascade.
 *
 * Takes the live XRP/USD price from FTSO and, for every agent, the price at
 * which its collateral ratio hits liquidation (derived from on-chain ratios,
 * exact). Draws a horizontal price axis with a marker per agent where it
 * breaches, and a what-if slider that reveals breached agents live.
 *
 * When FTSO is not served on testnet the live price is null. Rather than show
 * an empty chart we plot against a synthetic $1.00 baseline: because the
 * liquidation price is linear in the spot price (liqPrice = spot * (1 + move)),
 * the *shape* of the chart is identical to any real price — only the $ labels
 * are normalized. This keeps the cascade always populated and interactive.
 */
export function BreachCascade({
  view,
  oracle,
}: {
  view: RankingView;
  oracle: OracleView | null;
}) {
  const livePrice = oracle?.fresh ? oracle.priceUsd : null;
  const agents = useMemo(() => byRobustness(view.agents), [view.agents]);

  // Plotting price: live FTSO when fresh, else a synthetic $1.00 baseline.
  const BASELINE = 1;
  const effectivePrice = livePrice ?? BASELINE;
  const usingBaseline = livePrice === null;

  const liqPrices = useMemo(
    () => agents.map((a) => ({ a, price: liquidationPriceUsd(a, effectivePrice) })),
    [agents, effectivePrice],
  );

  const deepest = liqPrices.reduce(
    (min, p) => (p.price !== null && (min === null || p.price < min) ? p.price : min),
    null as number | null,
  );

  const [price, setPrice] = useState<number | null>(effectivePrice);
  const scenarioPrice = price ?? effectivePrice;

  const axisTop = scenarioPrice ?? BASELINE;
  const axisBottom = deepest ?? (scenarioPrice ? scenarioPrice * 0.4 : 0.4);
  const span = Math.max(axisTop - axisBottom, 1e-9);

  const pctFromTop = (p: number) => {
    const inv = (axisTop - p) / span;
    return Math.max(0, Math.min(100, inv * 100));
  };

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Breach cascade — driven by the XRP price
        </h3>
        {livePrice !== null ? (
          <span className="num text-[11px] text-[var(--color-muted)]">
            FTSO XRP/USD ${livePrice.toFixed(4)}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--color-faint)]">
            normalized to $1.00 baseline (FTSO not served on testnet)
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Each marker is the XRP price at which that agent liquidates (collateral
        ratio hits its binding threshold). Drag the price to watch agents fall
        off the cliff in order. {usingBaseline && "Labels are normalized to a $1.00 baseline; the relative positions are exact."}
      </p>

      {/* What-if price control */}
      <div className="mt-4 flex items-center gap-3 text-xs text-[var(--color-muted)]">
        <span className="w-28 shrink-0">What-if XRP price</span>
        <input
          type="range"
          min={axisBottom}
          max={axisTop}
          step={(span / 200) || 0.001}
          value={scenarioPrice ?? axisTop}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent)]"
          aria-label="What-if XRP price in USD"
        />
        <span className="num w-24 text-right text-[var(--color-text)]">
          ${scenarioPrice ? scenarioPrice.toFixed(4) : "—"}
        </span>
      </div>

      {/* Cascade axis */}
      <div className="relative mt-5 h-64 border-l border-[var(--color-line-bright)] bg-[var(--color-surface-2)]">
        {scenarioPrice !== null && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-[var(--color-good)]"
            style={{ top: `${pctFromTop(scenarioPrice)}%` }}
          >
            <span className="num absolute -top-2.5 left-2 bg-[var(--color-surface-2)] px-1 text-[10px] text-[var(--color-good)]">
              now ${scenarioPrice.toFixed(4)}
            </span>
          </div>
        )}

        {liqPrices.map(({ a, price: p }) => {
          if (p === null) return null;
          const breached = scenarioPrice !== null && p >= scenarioPrice;
          const color = breached ? "var(--color-bad)" : "var(--color-accent)";
          return (
            <div
              key={a.agentVault}
              className="absolute left-0 right-0 flex items-center"
              style={{ top: `${pctFromTop(p)}%` }}
            >
              <div
                className="h-0.5 flex-1"
                style={{ background: color, opacity: breached ? 1 : 0.7 }}
              />
              <span
                className="num ml-2 whitespace-nowrap px-1 text-[10px]"
                style={{ color }}
              >
                {a.agentVault.slice(0, 6)}… ${p.toFixed(4)}
                {breached ? " ⚠" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend / summary */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="text-[var(--color-faint)]">Breached at current price:</span>
        {agents.filter(
          (a) => scenarioPrice !== null && (liquidationPriceUsd(a, effectivePrice) ?? Infinity) >= scenarioPrice,
        ).length === 0 ? (
          <span className="text-[var(--color-good)]">none — all agents survive this price</span>
        ) : (
          agents
            .filter(
              (a) =>
                scenarioPrice !== null &&
                (liquidationPriceUsd(a, effectivePrice) ?? Infinity) >= scenarioPrice,
            )
            .map((a) => (
              <span key={a.agentVault} className="text-[var(--color-bad)]">
                {a.agentVault.slice(0, 6)}…
              </span>
            ))
        )}
      </div>
    </div>
  );
}
