"use client";

import { useCallback, useEffect, useState } from "react";

import { AgentComparison } from "@/components/AgentComparison";
import { AgentTable } from "@/components/AgentTable";
import { AnchorButton } from "@/components/AnchorButton";
import { ConcentrationPanel } from "@/components/ConcentrationPanel";
import { Reveal } from "@/components/Reveal";
import { RiskScore } from "@/components/RiskScore";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { ATTESTATION_ADDRESS } from "@/lib/attestation/abi";
import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import { formatShock } from "@/lib/scoring/stress";
import { formatMove } from "@/lib/scoring/liquidation";
import { fee, fxrp, headroom, ratio } from "@/lib/utils/format";
import type { OracleView, RankingView } from "@/lib/utils/view";

const PRESETS = [100, 500, 1000, 5000, 10000];
const SHOCKS = [0, -10, -25, -40, -60];

export default function Home() {
  const [amount, setAmount] = useState("500");
  const [shock, setShock] = useState(0);
  const [view, setView] = useState<RankingView | null>(null);
  const [oracle, setOracle] = useState<OracleView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (value: string, shockBips: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ amount: value });
      if (shockBips !== 0) params.set("shock", String(shockBips));
      const res = await fetch(`/api/rank?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setView(body as RankingView);
      setOracle((body as RankingView).oracle ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rank agents");
      setView(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run("500", 0);
  }, [run]);

  const recommended = view?.agents.find((a) => a.agentVault === view.recommendedVault);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-ink)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="flare-text text-base font-bold tracking-tight">LedgerGuard</span>
            <span className="hidden text-[11px] text-[var(--color-muted)] sm:inline">
              risk-ranked FXRP agent selection
            </span>
          </div>
          <nav className="flex items-center gap-4 text-[11px]">
            <a href="#why" className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              why
            </a>
            <a href="#scenario" className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              crash
            </a>
            <a href="#leaderboard" className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              leaderboard
            </a>
            <a href="/trail" className="text-[var(--color-muted)] hover:text-[var(--color-accent)]">
              agent trail →
            </a>
          </nav>
        </div>
        <div className="flare-bar opacity-80" />
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* HERO */}
        <section id="hero" className="py-14 sm:py-20">
          <div className="flare-text text-xs font-semibold uppercase tracking-[0.2em]">
            Flare · Coston2 · FAssets
          </div>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Pick an FXRP minting agent by risk — not by fee alone.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[var(--color-muted)]">
            LedgerGuard reads every live agent, projects what your mint does to each
            one&apos;s collateral, ranks them by transparent math, and anchors the
            result on-chain so anyone can verify it later.
          </p>

          <form
            className="mt-7"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center border border-[var(--color-line-bright)] bg-[var(--color-surface)]">
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  className="num w-40 bg-transparent px-4 py-3 text-lg outline-none"
                  placeholder="500"
                />
                <span className="px-3 text-xs text-[var(--color-faint)]">FXRP</span>
              </div>
              <button
                type="button"
                disabled={loading || !amount}
                onClick={() => void run(amount, shock)}
                className="flare-glow bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-black hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "Reading Coston2…" : "Rank agents"}
              </button>
              <div className="flex gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setAmount(String(p));
                      void run(String(p), shock);
                    }}
                    className="num border border-[var(--color-line)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-line-bright)] hover:text-[var(--color-text)]"
                  >
                    {p.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                <span className="w-28 shrink-0">Mint size</span>
                <input
                  type="range"
                  min={10}
                  max={10000}
                  step={10}
                  value={Math.min(10000, Math.max(10, Number(amount) || 0))}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    void run(e.target.value, shock);
                  }}
                  className="flex-1 accent-[var(--color-accent)]"
                />
                <span className="num w-20 text-right text-[var(--color-text)]">
                  {Number(amount).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className="w-28 shrink-0">Price shock (what-if)</span>
                {SHOCKS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setShock(s);
                      void run(amount, s);
                    }}
                    className={`num border px-2.5 py-1.5 ${
                      shock === s
                        ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                        : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-bright)]"
                    }`}
                  >
                    {s === 0 ? "none" : formatShock(s)}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </section>

        {error && (
          <div className="my-6 border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/[0.06] p-4 text-sm text-[var(--color-bad)]">
            {error}
          </div>
        )}

        {view && recommended && (
          <>
            {/* RECOMMENDATION */}
            <Reveal>
              <section id="recommendation" className="border-t border-[var(--color-line)] py-12">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-[var(--color-muted)]">
                  <span>
                    <span className="num text-[var(--color-text)]">{view.agentsAnalyzed}</span> agents
                    analyzed
                  </span>
                  <span>
                    <span className="num text-[var(--color-text)]">{view.eligibleCount}</span> can take{" "}
                    <span className="num">{view.mintAmountFxrp}</span> FXRP
                  </span>
                  {view.whatIfShockBips !== 0 && (
                    <span className="num text-[var(--color-warn)]">
                      what-if: XRP {formatShock(view.whatIfShockBips)}
                    </span>
                  )}
                  <span className="num text-[var(--color-faint)]">block {view.blockNumber}</span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="md:col-span-2 border border-[var(--color-accent)]/40 bg-[var(--color-surface)] p-6 flare-glow">
                    <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
                      Recommended agent
                    </div>
                    <div className="num mt-2 text-2xl text-[var(--color-accent)]">
                      {recommended.agentVault}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <Stat label="Post-mint CR" value={ratio(recommended.bindingLeg.projectedRatioBIPS)} />
                      <Stat
                        label="Headroom"
                        value={headroom(recommended.bindingLeg.projectedHeadroomBIPS)}
                      />
                      <Stat label="Liquidation at" value={ratio(recommended.bindingLeg.liquidationThresholdBIPS)} />
                      <Stat label="Fee" value={fee(recommended.feeBIPS)} />
                      <Stat
                        label="Survives XRP drop"
                        value={moveLabel(recommended.liquidationMoveBips)}
                        accent
                      />
                      <Stat label="Capacity" value={fxrp(recommended.availableCapacityUBA, view.assetUnitUBA)} />
                    </div>
                  </div>
                  <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
                    <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
                      Snapshot commitment
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <Row label="format" value={view.snapshotVersion} />
                      <Row label="block" value={view.blockNumber} />
                      <Row label="mint" value={`${view.mintAmountUBA} UBA`} />
                      <Row label="hash" value={view.snapshotHash} wrap />
                    </dl>
                  </div>
                </div>
              </section>
            </Reveal>

            {/* WHY */}
            <Reveal>
              <section id="why" className="border-t border-[var(--color-line)] py-12">
                <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  Why this agent — and how it compares
                </h2>
                <AgentComparison view={view} />
              </section>
            </Reveal>

            {/* SCENARIO */}
            <Reveal>
              <section id="scenario" className="border-t border-[var(--color-line)] py-12">
                <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  What if the price moves?
                </h2>
                <ScenarioPanel view={view} oracle={oracle} />
              </section>
            </Reveal>

            {/* LEADERBOARD */}
            <Reveal>
              <section id="leaderboard" className="border-t border-[var(--color-line)] py-12">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-[var(--color-text)]">Full leaderboard</h2>
                  {view.whatIfShockBips !== 0 && (
                    <span className="text-[11px] text-[var(--color-warn)]">
                      projected headroom under XRP {formatShock(view.whatIfShockBips)}
                    </span>
                  )}
                </div>
                <AgentTable view={view} shockBips={view.whatIfShockBips} />
              </section>
            </Reveal>

            {/* PROOF */}
            <Reveal>
              <section id="proof" className="border-t border-[var(--color-line)] py-12">
                <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  Anchor it on Coston2
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <AnchorButton view={view} contractAddress={ATTESTATION_ADDRESS} />
                    <a
                      href="/trail"
                      className="border border-[var(--color-line-bright)] bg-[var(--color-surface)] px-5 py-3 text-center text-sm text-[var(--color-accent)] hover:opacity-90"
                    >
                      View the verifiable on-chain proof →
                    </a>
                    {ATTESTATION_ADDRESS && (
                      <a
                        href={`${COSTON2_EXPLORER}/address/${ATTESTATION_ADDRESS}`}
                        target="_blank"
                        rel="noreferrer"
                        className="num text-center text-[11px] text-[var(--color-faint)] hover:text-[var(--color-accent)]"
                      >
                        RankingAttestation {shorten(ATTESTATION_ADDRESS)} on Coston2 explorer
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-4">
                    <RiskScore agent={recommended} />
                    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
                      <ConcentrationPanel view={view} />
                    </div>
                  </div>
                </div>
              </section>
            </Reveal>

            <footer className="border-t border-[var(--color-line)] py-8 text-[11px] leading-relaxed text-[var(--color-faint)]">
              LedgerGuard is a decision aid, not a guarantee. Every figure is a read-only
              estimate from Coston2 state at block <span className="num">{view.blockNumber}</span>.
              The crash-scenario and price-shock columns are deterministic sensitivity
              analyses on the on-chain collateral ratios — they isolate how an adverse
              move erodes headroom and are not part of the anchored ranking. Collateral
              ratios, oracle prices and agent availability change continuously; a ranking
              can be stale the moment after it is produced. LedgerGuard does not execute
              mints and does not replace AssetManager enforcement.
            </footer>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)]">{label}</div>
      <div className={`num mt-1 text-lg ${accent ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-[var(--color-faint)]">{label}</dt>
      <dd className={`num text-[var(--color-muted)] ${wrap ? "break-all" : ""}`}>{value}</dd>
    </div>
  );
}

function shorten(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function moveLabel(bips: string): string {
  return formatMove(BigInt(bips === "" ? "0" : bips));
}
