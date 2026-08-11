"use client";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import { FDC_HUB } from "@/lib/flare/fdc";

/**
 * Flare Data Connector (FDC) — the third Flare primitive LedgerGuard uses.
 *
 * Honesty note: a raw wallet call to `FdcHub.requestAttestation(bytes)` is NOT
 * the supported user path. FDC attestation requests must be *prepared* by
 * Flare's FDC relay (it computes the attestation round and the exact fee); a
 * hand-encoded direct call reverts. So this component does NOT fake a signed
 * FDC button that would fail on camera. Instead it points to the real relay
 * submission path and names the exact agent + on-chain hub the attestation
 * lands in. The genuine in-app signed action in LedgerGuard is the "Anchor
 * ranking on Coston2" transaction (RankingAttestation), which always works.
 */
export function FdcAttest({ agentVault }: { agentVault: string }) {
  const agentUrl = `${COSTON2_EXPLORER}/address/${agentVault}`;
  const relayUrl = "https://coston2-fdc-test.flare.network/";

  return (
    <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        Independently attestable via Flare FDC
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        LedgerGuard reads the AssetManager and writes the ranking hash on-chain
        (see “Anchor ranking” above — a real signed tx). The third Flare
        primitive is the <span className="num">Data Connector (FDC)</span>: it
        lets anyone request an independent attestation of off-chain data. The
        recommended agent’s public page can be attested by Flare’s verifier
        network, so “verifiable” extends beyond chain state.
      </p>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">on-chain hub</dt>
          <dd className="num text-[var(--color-text)]">FdcHub {FDC_HUB.slice(0, 8)}…</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">attests</dt>
          <dd className="num text-[var(--color-text)]">{agentVault.slice(0, 10)}…</dd>
        </div>
      </dl>

      <div className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
          request an FDC attestation (relay — the supported path)
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
          FDC requests are prepared by Flare’s relay, which assigns the round and
          exact fee. Submit the agent’s page through the Coston2 FDC relay:
        </p>
        <a
          href={relayUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block break-all text-[11px] text-[var(--color-accent)] hover:underline"
        >
          {relayUrl}
        </a>
        <p className="mt-2 text-[10px] text-[var(--color-faint)]">
          Attestation target: <span className="num">{agentUrl}</span>
        </p>
      </div>
    </div>
  );
}
