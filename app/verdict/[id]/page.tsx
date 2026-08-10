import { notFound } from "next/navigation";
import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

import { AgentTable } from "@/components/AgentTable";
import { ATTESTATION_ABI, ATTESTATION_ADDRESS } from "@/lib/attestation/abi";
import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import { loadReceipt } from "@/lib/utils/receipt-store";
import { shortAddress } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

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
 * The receipt reads the attestation back from Coston2 and compares it with the
 * cached ranking. The verdict shown is the result of that comparison, so the
 * page is evidence rather than a claim.
 */
async function verify(id: string, cachedHash: string): Promise<Verification> {
  if (!ATTESTATION_ADDRESS) {
    return { state: "unavailable", note: "No attestation contract is configured." };
  }

  try {
    const client = createPublicClient({ chain: flareTestnet, transport: http() });
    const record = await client.readContract({
      address: ATTESTATION_ADDRESS as `0x${string}`,
      abi: ATTESTATION_ABI,
      functionName: "get",
      args: [BigInt(id)],
    });

    return {
      state:
        record.snapshotHash.toLowerCase() === cachedHash.toLowerCase()
          ? "match"
          : "mismatch",
      onChainHash: record.snapshotHash,
      snapshotBlock: record.snapshotBlock.toString(),
      attestedAt: new Date(Number(record.attestedAt) * 1000).toISOString(),
      agentCount: Number(record.agentCount),
      submitter: record.submitter,
      recommendedAgent: record.recommendedAgent,
    };
  } catch {
    return {
      state: "unavailable",
      note: "Could not read this attestation from Coston2 right now.",
    };
  }
}

export default async function VerdictPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt = await loadReceipt(id);
  if (!receipt) notFound();

  const { view, txHash } = receipt;
  const verification = await verify(id, view.snapshotHash);

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
          attestation #{id} · flare coston2 · chain {view.chainId}
        </div>
      </header>

      <section className="mt-6">
        <VerificationBanner verification={verification} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Ranking">
          <Field label="asset" value="FXRP" />
          <Field label="mint amount" value={`${view.mintAmountFxrp} FXRP`} />
          <Field label="agents analyzed" value={String(view.agentsAnalyzed)} />
          <Field label="eligible" value={String(view.eligibleCount)} />
          <Field
            label="recommended"
            value={view.recommendedVault ?? "none eligible"}
            wrap
          />
        </Panel>

        <Panel title="Proof">
          <Field label="snapshot block" value={view.blockNumber} />
          <Field label="format" value={view.snapshotVersion} />
          <Field label="snapshot hash" value={view.snapshotHash} wrap />
          <Field
            label="attestation tx"
            value={txHash}
            wrap
            href={`${COSTON2_EXPLORER}/tx/${txHash}`}
          />
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
            value={view.assetManager}
            wrap
            href={`${COSTON2_EXPLORER}/address/${view.assetManager}`}
          />
        </Panel>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          The ranking that was anchored
        </h2>
        <AgentTable view={view} />
      </section>

      <section className="mt-8 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          How to verify this independently
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-[var(--color-muted)]">
          <li>
            Read <span className="num">getAvailableAgentsDetailedList</span> and{" "}
            <span className="num">getAgentInfo</span> from AssetManagerFXRP at block{" "}
            <span className="num text-[var(--color-text)]">{view.blockNumber}</span> on an
            archive node.
          </li>
          <li>
            Run <span className="num">rankAgents()</span> from this repository with mint
            amount <span className="num">{view.mintAmountUBA}</span> UBA.
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
          claim that the recommended agent is safe, and it does not bind the
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
