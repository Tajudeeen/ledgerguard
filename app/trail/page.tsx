"use client";

import { useEffect, useState } from "react";

import { TrailList } from "@/components/TrailList";
import type { AgentTrail } from "@/lib/attestation/trail";

type TrailResponse = {
  contract: string;
  attestationCount: number;
  firstBlock: number | null;
  latestBlock: number | null;
  agentsTracked: number;
  trails: AgentTrail[];
};

export default function TrailPage() {
  const [data, setData] = useState<TrailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/trail", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "failed to load trail");
        setData(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load trail");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-[var(--color-line)] pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Agent risk trail</h1>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              the verifiable, dated history of every FXRP agent LedgerGuard recorded
            </p>
          </div>
          <a href="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
            ← rank an agent
          </a>
        </div>
        {data && (
          <div className="num mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--color-faint)]">
            <span>{data.attestationCount} attestations</span>
            <span>{data.agentsTracked} agents tracked</span>
            {data.firstBlock !== null && <span>first block {data.firstBlock}</span>}
            {data.latestBlock !== null && <span>latest block {data.latestBlock}</span>}
            <span className="break-all">{data.contract}</span>
          </div>
        )}
      </header>

      {loading && <div className="mt-8 text-sm text-[var(--color-muted)]">Reading trail…</div>}
      {error && (
        <div className="mt-8 border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/[0.06] p-4 text-sm text-[var(--color-bad)]">
          {error}
        </div>
      )}
      {data && (
        <section className="mt-8">
          <TrailList trails={data.trails} />
        </section>
      )}

      <footer className="mt-10 border-t border-[var(--color-line)] pt-4 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Each point in a trail is an attestation on Coston2: a hash of the full
        ranking at a pinned block, signed by whoever anchored it. The ranking for
        that point is cached; you can independently confirm it by re-reading the
        AssetManager at the attestation&apos;s snapshot block with
        <span className="num"> script/reproduce.ts</span>. The trail is a record
        of what was recommended and when — not a prediction, and not a guarantee.
        Stability scores describe how consistently safe and available an agent
        has been across the recorded window.
      </footer>
    </main>
  );
}
