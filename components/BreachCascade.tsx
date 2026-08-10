"use client";

import { useMemo, useState } from "react";

import {
  byRobustness,
  liquidationMoveBips,
  liquidationPriceUsd,
} from "@/lib/scoring/liquidation";
import { formatShock } from "@/lib/scoring/stress";
import type { OracleView, RankingView } from "@/lib/utils/view";

/**
 * FTSO-driven breach cascade.
 *
 * Takes the live XRP/USD price from FTSO and, for every agent, the price at
 * which its collateral ratio hits liquidation (derived from on-chain ratios,
 * exact). Draws a horizontal price axis from the current price down to the
 * deepest liquidation price, with a marker per agent where it breaches. A
 * what-if price control lets the user drag XRP to any level and see, live,
 * which agents have already fallen below their liquidation price.
 *
 * This is the moment the oracle *drives* the UI: the recommendation and the
 * risk story are anchored to a real market price, not just relative ratios.
 */
export function BreachCascade({
  view,
  oracle,
}: {
  view: RankingView;
  oracle: OracleView | null;
}) {
  const xrpUsd = oracle?.fresh ? oracle.priceUsd : null;
  const agents = useMemo(() => byRobustness(view.agents), [view.agents]);

  // Absolute liquidation prices (only meaningful when we have a live price).
  const liqPrices = useMemo(
    () => agents.map((a) => ({ a, price: liquidationPriceUsd(a, xrpUsd) })),
    [agents, xrpUsd],
  );

  const deepest = liqPrices.reduce(
    (min, p) => (p.price !== null && (min === null || p.price < min) ? p.price : min),
    null as number | null,
  );

  // What-if price state. Default to current price (or a sensible fallback).
  const [price, setPrice] = useState<number | null>(xrpUsd);
  const scenarioPrice = price ?? xrpUsd;

  // Axis range: from current price down to deepest liquidation (or -60% if no price).
  const axisTop = scenarioPrice ?? 1;
  const axisBottom = deepest ?? (scenarioPrice ? scenarioPrice * 0.4 : 0.4);
  const span = Math.max(axisTop - axisBottom, 1e-9);

  const pctFromTop = (p: number) => {
    // 0% at top (current), 100% at bottom (deepest). Higher price = higher on axis.
    const inv = (axisTop - p) / span;
    return Math.max(0, Math.min(100, inv * 100));
  };

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Breach cascade — driven by the live XRP price
        </h3>
        {xrpUsd !== null ? (
          <span className="num text-[11px] text-[var(--color-muted)]">
            FTSO XRP/USD ${xrpUsd.toFixed(4)}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--color-faint)]">
            FTSO not served on testnet — showing % drawdown from on-chain ratios
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Each marker is the XRP price at which that agent liquidates (collateral
        ratio hits its binding threshold). Drag the price to watch agents fall off
        the cliff in order.
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
        {/* current price line */}
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

        {xrpUsd === null && (
          <div className="absolute bottom-2 left-2 right-2 text-[10px] text-[var(--color-faint)]">
            No live price — markers show % drawdown instead:{" "}
            {agents
              .map((a) => `${a.agentVault.slice(0, 6)}… ${formatShock(Number(liquidationMoveBips(a)))}`)
              .join("  ·  ")}
          </div>
        )}
      </div>

      {/* Legend / summary */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="text-[var(--color-faint)]">
          Breached at current price:
        </span>
        {agents.filter(
          (a) => scenarioPrice !== null && (liquidationPriceUsd(a, xrpUsd) ?? Infinity) >= scenarioPrice,
        ).length === 0 ? (
          <span className="text-[var(--color-good)]">none — all agents survive this price</span>
        ) : (
          agents
            .filter(
              (a) =>
                scenarioPrice !== null &&
                (liquidationPriceUsd(a, xrpUsd) ?? Infinity) >= scenarioPrice,
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
