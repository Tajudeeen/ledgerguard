"use client";

import { useMemo, useState } from "react";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import {
  FDC_HUB,
  FDC_URL_ATTESTATION_TYPE,
  buildFdcCastCommand,
  encodeFdcRequest,
  encodeUrlMessage,
  requestAttestationCalldata,
} from "@/lib/flare/fdc";

/**
 * Independently attest the recommended agent via Flare's Data Connector (FDC).
 *
 * This is the third Flare primitive LedgerGuard uses — after reading the
 * AssetManager and writing the ranking hash on-chain. FDC lets us request an
 * attestation of the agent's public page, so the claim "this agent exists and
 * is described as X" is verified by Flare's verifier network, not just by us.
 *
 * The on-chain submission target — FdcHub.requestAttestation(bytes) — is
 * verified present on Coston2. LedgerGuard never signs; it hands the user a
 * copy-ready command to submit the request from their own wallet.
 */
export function FdcAttest({ agentVault }: { agentVault: string }) {
  const agentUrl = `${COSTON2_EXPLORER}/address/${agentVault}`;

  const requestBytes = useMemo(() => {
    const message = encodeUrlMessage(agentUrl);
    return encodeFdcRequest({
      attestationType: FDC_URL_ATTESTATION_TYPE,
      sourceId: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      message,
    });
  }, [agentUrl]);

  const command = useMemo(
    () => buildFdcCastCommand(requestAttestationCalldata(requestBytes)),
    [requestBytes],
  );

  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
        LedgerGuard already reads the AssetManager and writes the ranking hash
        on-chain. Flare&apos;s Data Connector (FDC) is the third primitive: it lets
        anyone request an attestation of off-chain data. The command below asks
        Flare&apos;s verifier network to independently confirm the agent&apos;s
        public page — extending &quot;verifiable&quot; beyond chain state. Copy it
        into a wallet console to submit (LedgerGuard never signs).
      </p>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">target</dt>
          <dd className="num text-[var(--color-text)]">FdcHub</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">function</dt>
          <dd className="num text-[var(--color-text)]">requestAttestation(bytes)</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">attests</dt>
          <dd className="num text-[var(--color-text)]">{agentUrl.slice(0, 28)}…</dd>
        </div>
      </dl>

      <div className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
            copy-paste command
          </span>
          <button
            type="button"
            onClick={copy}
            className="text-[10px] text-[var(--color-accent)] hover:underline"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="num mt-2 whitespace-pre-wrap break-all text-[11px] text-[var(--color-text)]">
          {command}
        </pre>
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-faint)]">
        FdcHub {FDC_HUB.slice(0, 10)}… is verified live on Coston2. The FDC relay
        URL is unreachable from this build environment, so submission is a
        user-side command; the result is readable via the FDC explorer once the
        attestation round completes.
      </p>
    </div>
  );
}
