"use client";

import { useState } from "react";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import { FDC_HUB, buildFdcCastCommand } from "@/lib/flare/fdc";

/**
 * Flare Data Connector (FDC) - the third Flare primitive LedgerGuard uses.
 *
 * Honest status (verified Aug 2026): the Coston2 FDC relay
 * (coston2-fdc-test.flare.network) is currently DOWN (DNS ERR_NAME_NOT_RESOLVED),
 * and the public Web2Json source `PublicWeb2` sourceId is registry-registered
 * (not derivable without the relay), so an in-browser auto-submit is not
 * possible right now. Instead we expose a copy-ready `cast send` command that
 * submits a REAL on-chain FdcHub.requestAttestation(bytes) Web2Json request from
 * the user's own wallet - requestAttestation stores the bytes regardless of
 * fee-config support, so the request is genuinely anchored on-chain.
 * Fulfillment depends on Coston2's current Web2Json source whitelist.
 */
export function FdcAttest({ agentVault }: { agentVault: string }) {
  const agentUrl = `${COSTON2_EXPLORER}/address/${agentVault}`;
  const [copied, setCopied] = useState(false);
  const command = buildFdcCastCommand(agentUrl);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        Independently attest this agent via Flare FDC
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        LedgerGuard reads the AssetManager and writes the ranking hash on-chain
        (see &ldquo;Anchor ranking&rdquo; above - a real signed tx). The third
        Flare primitive is the <span className="num">Data Connector (FDC)</span>:
        it lets anyone request an independent attestation of off-chain data. The
        command below submits a real, wallet-signed{" "}
        <span className="num">FdcHub.requestAttestation(bytes)</span> Web2Json
        attestation of the agent&apos;s public page from your own key.
      </p>

      <div className="mt-4 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
            copy-ready FDC request (cast send)
          </div>
          <button
            type="button"
            onClick={copy}
            className="rounded bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-black hover:opacity-90"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-[var(--color-text)]">
          <code>{command}</code>
        </pre>
      </div>

      <div className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
          or submit via the explorer (write contract)
        </div>
        <a
          href={`${COSTON2_EXPLORER}/address/${FDC_HUB}?tab=write_contract`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block break-all text-[11px] text-[var(--color-accent)] hover:underline"
        >
          {FDC_HUB} → write requestAttestation(bytes)
        </a>
        <p className="mt-2 text-[10px] text-[var(--color-faint)]">
          Status: the Coston2 FDC relay is currently down (DNS
          ERR_NAME_NOT_RESOLVED) and the public Web2Json source id is
          registry-managed, so in-app auto-submit is unavailable this testnet
          cycle. The command above still anchors a real request on-chain.
          Attestation target: <span className="num">{agentUrl}</span>
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">on-chain hub</dt>
          <dd className="num text-[var(--color-text)]">FdcHub {FDC_HUB.slice(0, 8)}…</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">type</dt>
          <dd className="num text-[var(--color-text)]">Web2Json (0x06)</dd>
        </div>
      </dl>
    </div>
  );
}
