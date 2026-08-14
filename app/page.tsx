"use client";

import { useCallback, useEffect, useState } from "react";

import { AgentComparison } from "@/components/AgentComparison";
import { AgentTable } from "@/components/AgentTable";
import { AnchorButton } from "@/components/AnchorButton";
import { ConcentrationPanel } from "@/components/ConcentrationPanel";
import { Reveal } from "@/components/Reveal";
import { RiskScore } from "@/components/RiskScore";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { BreachCascade } from "@/components/BreachCascade";
import { CoreVaultMint } from "@/components/MintAction";
import { MintLimiter } from "@/components/MintLimiter";
import { FdcAttest } from "@/components/FdcAttest";
import { RedemptionAgent } from "@/components/RedemptionAgent";
import { ATTESTATION_ADDRESS } from "@/lib/attestation/abi";
import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import { formatShock } from "@/lib/scoring/stress";
import { formatMove } from "@/lib/scoring/liquidation";
import { fee, fxrp, headroom, ratio } from "@/lib/utils/format";
import type { OracleView, RankingView } from "@/lib/utils/view";

const PRESETS = [100, 500, 1000, 5000];
const SHOCKS = [0, -1000, -2500, -4000, -6000];  // BIPS: 0%, -10%, -25%, -40%, -60%

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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flare-text text-base font-bold tracking-tight">LedgerGuard</span>
            <span className="hidden text-[11px] text-[var(--color-muted)] sm:inline">
              FXRP collateral risk & redemption safety
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-[11px] sm:gap-4">
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
            Every FXRP is backed by agent collateral - see which agents can still pay you out, and watch the system survive a crash.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[var(--color-muted)]">
            Minting FXRP is now a direct payment to the Flare <span className="text-[var(--color-text)]">Core Vault</span> - you
            don&apos;t pick an agent to mint. Agents instead post the collateral that
            backs the FXRP already in circulation, and they are the ones you deal with
            to <span className="text-[var(--color-text)]">redeem</span> back to XRP. LedgerGuard is a live <span className="text-[var(--color-text)]">risk radar</span>
            for that backing: it ranks every live Coston2 agent by exactly how deep a
            crash its collateral survives, shows the live Core Vault mint throttle,
            and anchors the whole view on Coston2 so anyone can replay and verify it.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-[11px]">
            {[
              ["Read", "live Coston2 agents + Core Vault throttle"],
              ["Rank", "by crash survival, not fee"],
              ["Anchor", "the view on-chain so it's verifiable"],
            ].map(([step, desc], i) => (
              <div
                key={step}
                className="flex items-center gap-2 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
              >
                <span className="num text-[var(--color-accent)]">{i + 1}</span>
                <span className="font-medium text-[var(--color-text)]">{step}</span>
                <span className="text-[var(--color-faint)]">{desc}</span>
              </div>
            ))}
          </div>

          <form
            className="mt-7"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center border border-[var(--color-line-bright)] bg-[var(--color-surface)]">
                <input
                  id="mint-amount"
                  inputMode="numeric"
                  aria-label="FXRP amount"
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
              <span className="w-28 shrink-0">FXRP amount</span>
                <input
                  type="range"
                  min={10}
                  max={10000}
                  step={10}
                  aria-label="FXRP amount"
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

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="md:col-span-2 border border-[var(--color-accent)]/40 bg-[var(--color-surface)] p-6 flare-glow">
                      <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
                        Safest redemption agent
                      </div>
                      <div className="num mt-2 text-2xl text-[var(--color-accent)]">
                        {recommended.agentVault}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--color-faint)]">
                        Most crash-resilient agent at block {view.blockNumber}. A stored
                        receipt may name a different agent - it is pinned to its own block.
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <Stat label="Post-redemption CR" value={ratio(recommended.bindingLeg.projectedRatioBIPS)} />
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
                      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-faint)]">
                        The FXRP you would mint is backed by{" "}
                        <span className="num text-[var(--color-text)]">{view.concentration.agentCount} live agents</span>{" "}
                        holding{" "}
                        <span className="num text-[var(--color-text)]">
                          {fxrp(view.concentration.totalBackedUBA, view.assetUnitUBA)} FXRP
                        </span>{" "}
                        of total collateral backing. Below: the safest agent to redeem with.
                      </p>
                      <RedemptionAgent
                        recommendedVault={recommended.agentVault}
                        amountFxrp={Number(amount) || 0}
                        assetManager={view.assetManager}
                      />
                      {view.comparison?.headline && (
                        <p className="mt-4 border-l-2 border-[var(--color-accent)]/60 bg-[var(--color-surface)]/60 pl-3 text-xs leading-relaxed text-[var(--color-text)]">
                          {view.comparison.headline}
                        </p>
                      )}
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

            {/* HOW MINTING WORKS NOW (the model the reviewer flagged) */}
            <Reveal>
              <CoreVaultMint />
            </Reveal>

            {/* LIVE CORE VAULT MINT THROTTLE - proves we read the new surface */}
            {view.directMinting && (
              <Reveal>
                <MintLimiter limiter={view.directMinting} />
              </Reveal>
            )}

            {/* SCENARIO (leads - concrete proof point right after the recommendation) */}
            <Reveal>
              <section id="scenario" className="border-t border-[var(--color-line)] py-12">
                <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  What if the price moves?
                </h2>
                <ScenarioPanel view={view} oracle={oracle} />
                <div className="mt-4">
                  <BreachCascade view={view} oracle={oracle} />
                </div>
              </section>
            </Reveal>

            {/* WHY */}
            <Reveal>
              <section id="why" className="border-t border-[var(--color-line)] py-12">
                <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  Why this agent - and how the backing compares
                </h2>
                <AgentComparison view={view} />
              </section>
            </Reveal>

            {/* LEADERBOARD (follows - dense table, now after the payoff) */}
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
                <p className="mb-4 max-w-2xl text-xs leading-relaxed text-[var(--color-muted)]">
                  The anchor is a timestamped receipt: a hash of the full agent view at a
                  pinned block, written to Coston2 so anyone can replay and confirm it
                  was computed at that block. That proves provenance and reproducibility
                  - it does not by itself guarantee the view is correct, because
                  anyone can anchor a hash. Correctness is what the open, reproducible
                  engine plus the on-chain snapshot block let a third party verify for
                  themselves.
                </p>
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

            <Reveal>
              <section id="fdc" className="border-t border-[var(--color-line)] py-12">
                <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  Independently verifiable by Flare FDC
                </h2>
                <FdcAttest agentVault={recommended.agentVault} />
              </section>
            </Reveal>

            <Reveal>
              <section id="scope" className="border-t border-[var(--color-line)] py-10">
                <h2 className="mb-3 text-sm font-medium text-[var(--color-text)]">
                  What LedgerGuard is - and isn&apos;t
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-xs leading-relaxed text-[var(--color-muted)]">
                    <span className="font-medium text-[var(--color-good)]">It is </span>
                    a read-only risk advisor: it reads live Coston2 agents, ranks them
                    by collateral headroom and crash survival, and anchors a replayable
                    view of the system on-chain. Every number traces back to chain
                    state you can re-read yourself.
                  </div>
                  <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-xs leading-relaxed text-[var(--color-muted)]">
                    <span className="font-medium text-[var(--color-warn)]">It isn&apos;t </span>
                    a minter or a redeemer - it never signs a transaction and the FXRP
                    mint itself is a direct payment to the Core Vault, not an agent
                    choice. On Coston2 today all four agents charge the same 0.25% fee,
                    so the ranking is by risk, not price. Scope, not a gap.
                  </div>
                </div>
              </section>
            </Reveal>

            <footer className="border-t border-[var(--color-line)] py-8 text-[11px] leading-relaxed text-[var(--color-faint)]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-[var(--color-text)]">© 2026 LedgerGuard</span>
                <a
                  href="https://github.com/Tajudeeen/ledgerguard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
                >
                  GitHub
                </a>
                <span>Built for the Summer Signal hackathon · Flare Coston2</span>
              </div>
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
