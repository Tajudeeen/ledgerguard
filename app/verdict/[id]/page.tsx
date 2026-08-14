import { notFound } from "next/navigation";

import { AgentTable } from "@/components/AgentTable";
import { ATTESTATION_ADDRESS } from "@/lib/attestation/abi";
import { readAttestationRecordById, type AttestationRecord } from "@/lib/attestation/record";
import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import { loadReceipt, type StoredReceipt } from "@/lib/utils/receipt-store";
import type { RankingView } from "@/lib/utils/view";
import { shortAddress } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// Canonical FXRP AssetManager on Coston2 (resolved at runtime via the Flare
// Contract Registry on the live homepage). Used only for the explorer link
// when the local ranking cache has been wiped.
const FXRP_ASSET_MANAGER = "0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA";

type Verification =
  | { state: "unavailable"; note: string }
  | {
      state: "match" | "mismatch";
      onChainHash: string;
      snapshotBlock: string;
      attestedAt: string;
      agentCount: number;
      submitter: string;
      recommendedAgent: string;
    };

/**
 * The receipt always reads the attestation back from Coston2 (the durable,
 * cache-independent source of truth) and renders it. The detailed per-agent
 * ranking is a convenience held in the local receipt cache; when that cache
 * is missing (e.g. after a host restart) we still show the verifiable
 * on-chain record and say plainly that the agent table is not cached — we
 * never 404 an attestation that provably exists on-chain.
 */
async function verify(
  record: AttestationRecord,
  cachedHash: string | null,
): Promise<Verification> {
  if (!ATTESTATION_ADDRESS) {
    return { state: "unavailable", note: "No attestation contract is configured." };
  }

  if (cachedHash) {
    return {
      state:
        record.snapshotHash.toLowerCase() === cachedHash.toLowerCase()
          ? "match"
          : "mismatch",
      onChainHash: record.snapshotHash,
      snapshotBlock: String(record.snapshotBlock),
      attestedAt: new Date(record.attestedAtMs).toISOString(),
      agentCount: record.agentCount,
      submitter: record.submitter,
      recommendedAgent: record.recommendedAgent,
    };
  }

  return {
    state: "unavailable",
    note:
      "The detailed ranking for this attestation was not found in the local " +
      "cache (it is rebuilt as the worker re-attests). The on-chain record " +
      "below is the durable, verifiable proof and is complete on its own.",
  };
}

function buildHeader(id: string, rec: AttestationRecord, view: RankingView | null) {
  return {
    id,
    snapshotHash: rec.snapshotHash,
    snapshotBlock: rec.snapshotBlock,
    chainId: view?.chainId ?? 114,
    assetManager: view?.assetManager ?? FXRP_ASSET_MANAGER,
    mintAmountUBA: rec.mintAmountUBA,
    mintAmountFxrp:
      view?.mintAmountFxrp ?? (Number(rec.mintAmountUBA) / 1e6).toString(),
    assetUnitUBA: view?.assetUnitUBA ?? "1000000",
    attestedAtMs: rec.attestedAtMs,
    agentCount: rec.agentCount,
    submitter: rec.submitter,
    recommendedAgent: rec.recommendedAgent,
    cacheHit: view !== null,
  };
}

export default async function VerdictPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9]{1,20}$/.test(id)) notFound();

  const receipt: StoredReceipt | null = await loadReceipt(id);
  const record = await readAttestationRecordById(Number(id));
  if (!record) notFound();

  const view = receipt?.view ?? null;
  const header = buildHeader(id, record, view);
  const txHash = receipt?.txHash ?? null;
  const verification = await verify(record, view?.snapshotHash ?? null);

  const recommendedLabel =
    header.recommendedAgent === ZERO_ADDRESS
      ? "none eligible"
      : header.recommendedAgent;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-[var(--color-line)] pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight">
            LedgerGuard ranking receipt
          </h1>
          <a href="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
            ← new ranking
          </a>
          <a href="/trail" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
            agent trail →
          </a>
        </div>
        <div className="num mt-1 text-[11px] text-[var(--color-faint)]">
          attestation #{id} · flare coston2 · chain {header.chainId}
        </div>
      </header>

      {!header.cacheHit && (
        <div className="mt-6 border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/[0.06] p-4 text-sm text-[var(--color-warn)]">
          This attestation exists on Coston2 but its detailed per-agent ranking
          was not in the local cache (the cache is wiped when the demo host
          restarts). The verifiable on-chain record below is complete — the
          agent table returns as the worker re-attests.
        </div>
      )}

      <section className="mt-6">
        <VerificationBanner verification={verification} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Ranking">
          <Field label="asset" value="FXRP" />
          <Field label="mint amount" value={`${header.mintAmountFxrp} FXRP`} />
          <Field
            label="agents analyzed"
            value={view ? String(view.agentsAnalyzed) : String(header.agentCount)}
          />
          <Field
            label="eligible"
            value={view ? String(view.eligibleCount) : "— (not cached)"}
          />
          <Field label="recommended" value={recommendedLabel} wrap />
        </Panel>

        <Panel title="Proof">
          <Field label="snapshot block" value={String(header.snapshotBlock)} />
          <Field label="format" value={view?.snapshotVersion ?? "LEDGERGUARD-V1"} />
          <Field label="snapshot hash" value={header.snapshotHash} wrap />
          {txHash ? (
            <Field
              label="attestation tx"
              value={txHash}
              wrap
              href={`${COSTON2_EXPLORER}/tx/${txHash}`}
            />
          ) : (
            <Field
              label="attestation tx"
              value="not in local cache (recover from RankingAttested event)"
              wrap
            />
          )}
          {ATTESTATION_ADDRESS && (
            <Field
              label="contract"
              value={ATTESTATION_ADDRESS}
              wrap
              href={`${COSTON2_EXPLORER}/address/${ATTESTATION_ADDRESS}`}
            />
          )}
          <Field
            label="asset manager"
            value={header.assetManager}
            wrap
            href={`${COSTON2_EXPLORER}/address/${header.assetManager}`}
          />
        </Panel>
      </section>

      {view ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
            The ranking that was anchored
          </h2>
          <AgentTable view={view} />
        </section>
      ) : (
        <section className="mt-8 border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-muted)]">
          The per-agent ranking for this attestation is not in the local cache,
          so the detailed table is not shown here. You can still confirm the
          anchored hash, block, FXRP amount and safest redemption agent above against
          the contract, and the{" "}
          <a href="/trail" className="text-[var(--color-accent)] hover:underline">
            agent trail
          </a>{" "}
          surfaces the same on-chain ledger.
        </section>
      )}

      <section className="mt-8 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          How to verify this independently
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-[var(--color-muted)]">
          <li>
            Read <span className="num">getAvailableAgentsDetailedList</span> and{" "}
            <span className="num">getAgentInfo</span> from AssetManagerFXRP at block{" "}
            <span className="num text-[var(--color-text)]">{header.snapshotBlock}</span> on an
            archive node.
          </li>
          <li>
            Run <span className="num">rankAgents()</span> from this repository with mint
            amount <span className="num">{header.mintAmountUBA}</span> UBA.
          </li>
          <li>
            Compute <span className="num">buildSnapshotCommitment()</span> and compare the
            result with the hash above.
          </li>
          <li>
            Read <span className="num">get({id})</span> on the attestation contract and
            confirm it holds the same hash.
          </li>
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-faint)]">
          An attestation records what LedgerGuard computed and when. It is not a
          claim that the safest redemption agent is safe, and it does not bind the
          agent to anything.
        </p>
      </section>
    </main>
  );
}

function VerificationBanner({ verification }: { verification: Verification }) {
  if (verification.state === "unavailable") {
    return (
      <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
        {verification.note}
      </div>
    );
  }

  const ok = verification.state === "match";

  return (
    <div
      className={`border p-4 ${
        ok
          ? "border-[var(--color-good)]/40 bg-[var(--color-good)]/[0.06]"
          : "border-[var(--color-bad)]/40 bg-[var(--color-bad)]/[0.06]"
      }`}
    >
      <div
        className={`text-sm font-medium ${
          ok ? "text-[var(--color-good)]" : "text-[var(--color-bad)]"
        }`}
      >
        {ok
          ? "Verified — the hash stored on Coston2 matches this ranking"
          : "Mismatch — the on-chain hash does not match this ranking"}
      </div>
      <div className="num mt-2 space-y-1 text-[11px] text-[var(--color-muted)]">
        <div className="break-all">on-chain hash: {verification.onChainHash}</div>
        <div>
          snapshot block {verification.snapshotBlock} · {verification.agentCount} agents ·
          attested {verification.attestedAt}
        </div>
        <div>
          submitted by {shortAddress(verification.submitter)} · recommends{" "}
          {shortAddress(verification.recommendedAgent)}
        </div>
        <div className="text-[var(--color-faint)]">
          Recommendation is pinned to block {verification.snapshotBlock}. The live
          homepage reflects current Coston2 state and may name a different agent as
          conditions change.
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
        {title}
      </div>
      <dl className="mt-3 space-y-2 text-xs">{children}</dl>
    </div>
  );
}

function Field({
  label,
  value,
  wrap = false,
  href,
}: {
  label: string;
  value: string;
  wrap?: boolean;
  href?: string;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-[var(--color-faint)]">{label}</dt>
      <dd className={`num ${wrap ? "break-all" : ""}`}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-accent)] hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="text-[var(--color-muted)]">{value}</span>
        )}
      </dd>
    </div>
  );
}
