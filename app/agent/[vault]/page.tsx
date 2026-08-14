import { notFound } from "next/navigation";
import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

import { ATTESTATION_ABI, ATTESTATION_ADDRESS } from "@/lib/attestation/abi";
import {
  buildTrails,
  readAttestationRecords,
  type AgentTrail,
  type AttestationRecord,
} from "@/lib/attestation/trail";
import { loadRankingView } from "@/lib/utils/receipt-store";
import { headroom, ratio, shortAddress } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

function isAddressLike(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function stabilityTier(score: number): { label: string; className: string } {
  if (score >= 0.75) return { label: "STABLE", className: "text-[var(--color-good)]" };
  if (score >= 0.5) return { label: "STEADY", className: "text-[var(--color-warn)]" };
  if (score >= 0.25) return { label: "VARIABLE", className: "text-[var(--color-warn)]" };
  return { label: "UNPROVEN", className: "text-[var(--color-faint)]" };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ vault: string }>;
}) {
  const { vault } = await params;
  if (!isAddressLike(vault)) notFound();

  const trail = await loadTrail(vault.toLowerCase());

  if (!trail) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
        <a href="/trail" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← trail
        </a>
        <div className="mt-8 border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
          <span className="num">{vault}</span> has not appeared in any recorded
          attestation yet, so there is no verifiable history for it.
        </div>
      </main>
    );
  }

  const tier = stabilityTier(trail.stabilityScore);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <a href="/trail" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
        ← agent trail
      </a>

      <header className="mt-4 border-b border-[var(--color-line)] pb-4">
        <h1 className="num text-lg font-semibold break-all">{trail.agentVault}</h1>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-[var(--color-faint)]">
          <span className={`text-sm font-medium tracking-wide ${tier.className}`}>
            {tier.label} · stability {trail.stabilityScore.toFixed(2)}
          </span>
          <span>{trail.observations} observations</span>
          <span>{trail.eligibleObservations} eligible</span>
          <span>
            recommended {trail.timesRecommended}/{trail.observations} times
          </span>
          {trail.everBreached && (
            <span className="text-[var(--color-bad)]">breached liquidation in window</span>
          )}
        </div>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Stability score" value={trail.stabilityScore.toFixed(3)} accent />
        <Metric
          label="Avg projected headroom (rel.)"
          value={trail.stabilityComponents.averageProjectedHeadroom.toFixed(2)}
        />
        <Metric label="Availability" value={trail.stabilityComponents.availability.toFixed(2)} />
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Stability = 0.6 × average relative headroom + 0.3 × availability + 0.1 ×
        recommended share. It scores how consistently safe and usable the agent
        has been across the recorded window. It is a summary of the past, not a
        promise about the next block.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          Recorded history (oldest → newest)
        </h2>
        <div className="overflow-x-auto border border-[var(--color-line)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
                <th className="px-3 py-2.5 font-medium">Att.</th>
                <th className="px-3 py-2.5 font-medium text-right">Block</th>
                <th className="px-3 py-2.5 font-medium text-right">Rank</th>
                <th className="px-3 py-2.5 font-medium text-right">Proj. CR</th>
                <th className="px-3 py-2.5 font-medium text-right">Headroom</th>
                <th className="px-3 py-2.5 font-medium text-right">Score</th>
                <th className="px-3 py-2.5 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {trail.points.map((p) => (
                <tr key={p.attestationId} className="border-b border-[var(--color-line)]">
                  <td className="num px-3 py-2.5 text-[var(--color-muted)]">
                    <a
                      href={`/verdict/${p.attestationId}`}
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      #{p.attestationId}
                    </a>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[var(--color-muted)]">
                    {p.blockNumber}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{p.rank ?? "-"}</td>
                  <td className="num px-3 py-2.5 text-right">
                    {ratio(p.projectedRatioBIPS)}
                  </td>
                  <td
                    className={`num px-3 py-2.5 text-right ${
                      p.projectedHeadroomBIPS &&
                      BigInt(p.projectedHeadroomBIPS) < 0n
                        ? "text-[var(--color-bad)]"
                        : "text-[var(--color-good)]"
                    }`}
                  >
                    {headroom(p.projectedHeadroomBIPS)}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[var(--color-muted)]">
                    {p.score?.toFixed(3) ?? "-"}
                  </td>
                  <td className="num px-3 py-2.5 text-[11px]">
                    <a
                      href={`/verdict/${p.attestationId}`}
                      className="text-[var(--color-faint)] hover:text-[var(--color-accent)]"
                      title={p.snapshotHash}
                    >
                      {shortAddress(p.snapshotHash)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-faint)]">
          Each “Verified” hash links to the snapshot. The ranking for that
          attestation is cached; re-run{" "}
          <span className="num">script/reproduce.ts &lt;block&gt; &lt;amount&gt; &lt;id&gt;</span>{" "}
          to confirm it reproduces.
        </p>
      </section>
    </main>
  );
}

async function loadTrail(vault: string): Promise<AgentTrail | null> {
  if (!ATTESTATION_ADDRESS) return null;
  try {
    const client = createPublicClient({ chain: flareTestnet, transport: http() });
    const records: AttestationRecord[] = await readAttestationRecords(
      client as unknown as { readContract: (args: Record<string, unknown>) => Promise<unknown> },
      ATTESTATION_ADDRESS,
      ATTESTATION_ABI,
    );
    const trails = await buildTrails(records, (id) => loadRankingView(String(id)));
    return trails.find((t) => t.agentVault.toLowerCase() === vault) ?? null;
  } catch {
    return null;
  }
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">{label}</div>
      <div className={`num mt-1.5 text-2xl ${accent ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
        {value}
      </div>
    </div>
  );
}
