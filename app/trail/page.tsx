"use client";

import { useEffect, useState } from "react";

import { TrailList } from "@/components/TrailList";
import type { AgentTrail } from "@/lib/attestation/trail";
import type { AttestationRecord } from "@/lib/attestation/trail";
import { formatTs } from "@/lib/utils/format";

type TrailResponse = {
  contract: string;
  attestationCount: number;
  firstBlock: number | null;
  latestBlock: number | null;
  agentsTracked: number;
  cachedPoints: number;
  missingFromCache: number;
  cacheGap: boolean;
  trails: AgentTrail[];
  records: AttestationRecord[];
};

export default function TrailPage() {
  const [data, setData] = useState<TrailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/trail", { cache: "no-store", signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "failed to load trail");
        setData(body);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "failed to load trail");
      } finally {
        clearTimeout(slowTimer);
        setLoading(false);
      }
    })();
    return () => {
      clearTimeout(slowTimer);
      ctrl.abort();
    };
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
            <span>{data.attestationCount} on-chain attestations</span>
            {data.agentsTracked > 0 && <span>{data.agentsTracked} agents with cached rankings</span>}
            {data.firstBlock !== null && <span>first block {data.firstBlock}</span>}
            {data.latestBlock !== null && <span>latest block {data.latestBlock}</span>}
            <span className="break-all">{data.contract}</span>
          </div>
        )}
      </header>

      {loading && (
        <div className="mt-8 text-sm text-[var(--color-muted)]">
          Reading trail…{slow && " (the demo host may be waking from sleep — this usually resolves in a few seconds)"}
        </div>
      )}
      {error && (
        <div className="mt-8 border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/[0.06] p-4 text-sm text-[var(--color-bad)]">
          {error}
        </div>
      )}

      {/* The on-chain ledger is always rendered from current chain state — it
          never depends on the ephemeral receipt cache, so the page is never dead. */}
      {data && data.records.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-[var(--color-text)]">
            On-chain attestation ledger
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-[var(--color-muted)]">
            Every entry below is a real attestation on Coston2: a hash of the full
            ranking at a pinned block, plus the agent that was recommended and who
            anchored it. Re-read the AssetManager at the snapshot block with{" "}
            <span className="num">script/reproduce.ts</span> to confirm the hash
            yourself. This is the durable, cache-independent record.
          </p>
          <div className="overflow-x-auto border border-[var(--color-line)] bg-[var(--color-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Block</th>
                  <th className="px-3 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Recommended agent</th>
                  <th className="px-3 py-2.5 font-medium">Snapshot hash</th>
                  <th className="px-3 py-2.5 font-medium">Submitter</th>
                </tr>
              </thead>
              <tbody>
                {[...data.records].reverse().map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="num px-3 py-2.5 text-[var(--color-faint)]">{r.id}</td>
                    <td className="num px-3 py-2.5 text-[var(--color-muted)]">{r.snapshotBlock}</td>
                    <td className="num px-3 py-2.5 text-[var(--color-muted)]">
                      {formatTs(r.attestedAtMs)}
                    </td>
                    <td className="num px-3 py-2.5">
                      <a
                        href={`/agent/${r.recommendedAgent}`}
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        {r.recommendedAgent.slice(0, 6)}…{r.recommendedAgent.slice(-4)}
                      </a>
                    </td>
                    <td className="num px-3 py-2.5 break-all text-[var(--color-muted)]">
                      {r.snapshotHash.slice(0, 10)}…{r.snapshotHash.slice(-8)}
                    </td>
                    <td className="num px-3 py-2.5 text-[var(--color-faint)]">
                      {r.submitter.slice(0, 6)}…{r.submitter.slice(-4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Per-agent time-series + stability: only when the receipt cache has the
          rankings. If the host restarted and the cache was wiped, we say so
          honestly instead of faking an empty/stuck table. */}
      {data && data.trails.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-[var(--color-text)]">
            Per-agent headroom over time
          </h2>
          <TrailList trails={data.trails} />
        </section>
      )}

      {data?.cacheGap && (
        <div className="mt-8 border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/[0.06] p-4 text-sm text-[var(--color-warn)]">
          {data.attestationCount} attestation{data.attestationCount === 1 ? "" : "s"} are confirmed on
          Coston2 (see the ledger above). Their per-agent headroom history was cached
          on disk and lost when the demo host restarted — a hosting artifact, not a
          gap in the proof. The ledger above stays intact, and the worker re-attests
          every few minutes to rebuild the time-series. Reproduce any point yourself
          with <span className="num">script/reproduce.ts</span>.
        </div>
      )}

      <footer className="mt-10 border-t border-[var(--color-line)] pt-4 text-[11px] leading-relaxed text-[var(--color-faint)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--color-line)] pb-4">
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
        <p className="mt-4">
          An attestation is a timestamped receipt: a hash of the ranking at a pinned
          block, anchored on Coston2 so anyone can replay and confirm it. It proves
          provenance and that the numbers were computed at that block — it does not
          by itself guarantee the ranking is correct, because anyone can anchor a
          hash. Correctness is what the reproducible engine + the on-chain snapshot
          block let a third party verify. The trail is a record of what was
          recommended and when — not a prediction, and not a guarantee.
        </p>
      </footer>
    </main>
  );
}
