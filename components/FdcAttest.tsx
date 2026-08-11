"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Hex,
} from "viem";
import { flareTestnet } from "viem/chains";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";
import {
  FDC_HUB,
  FDC_URL_ATTESTATION_TYPE,
  encodeFdcRequest,
  encodeUrlMessage,
  fdcRequestCalldata,
} from "@/lib/flare/fdc";

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "done"; txHash: Hex }
  | { kind: "error"; message: string };

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const COSTON2_HEX = "0x72"; // 114
const FDC_RELAY = "https://coston2-fdc-test.flare.network/";

/**
 * Flare Data Connector (FDC) — the third Flare primitive LedgerGuard uses.
 *
 * The "Attest agent via FDC" button performs a REAL, wallet-signed
 * `FdcHub.requestAttestation(bytes)` (verified present on Coston2). Direct
 * submits succeed when an FDC attestation round is open for the type; they
 * revert when no round is open or the fee differs — so we surface the exact
 * revert reason instead of failing silently, and link the relay as the
 * guaranteed path (the relay only accepts during open rounds and computes the
 * fee). LedgerGuard never holds a key.
 */
export function FdcAttest({ agentVault }: { agentVault: string }) {
  const agentUrl = `${COSTON2_EXPLORER}/address/${agentVault}`;
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const requestBytes = encodeFdcRequest({
    attestationType: FDC_URL_ATTESTATION_TYPE,
    sourceId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
    message: encodeUrlMessage(agentUrl),
  });
  const data = fdcRequestCalldata(requestBytes);

  async function attest() {
    if (!window.ethereum) {
      setStatus({ kind: "error", message: "No injected wallet found. Install MetaMask." });
      return;
    }
    try {
      setStatus({ kind: "working", message: "Connecting wallet…" });
      const provider = window.ethereum;
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0] as `0x${string}`;

      const currentChain = (await provider.request({ method: "eth_chainId" })) as string;
      if (currentChain !== COSTON2_HEX) {
        setStatus({ kind: "working", message: "Switching to Coston2…" });
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: COSTON2_HEX }],
          });
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: COSTON2_HEX,
                chainName: "Flare Testnet Coston2",
                nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
                rpcUrls: ["https://coston2-api.flare.network/ext/C/rpc"],
                blockExplorerUrls: [COSTON2_EXPLORER],
              },
            ],
          });
        }
      }

      const wallet = createWalletClient({
        account,
        chain: flareTestnet,
        transport: custom(provider),
      });
      const publicClient = createPublicClient({
        chain: flareTestnet,
        transport: http(),
      });

      setStatus({ kind: "working", message: "Confirm in wallet — FDC request…" });
      const txHash = await wallet.sendTransaction({
        to: FDC_HUB,
        data,
        value: 10_000_000_000_000_000n, // 0.01 C2FLR toward the FDC request fee
      });

      setStatus({ kind: "working", message: "Waiting for confirmation…" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error("Reverted — FDC round may be closed or fee differs. Use the relay link below.");
      }

      setStatus({ kind: "done", txHash });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? ((error as unknown as { shortMessage?: string }).shortMessage ||
                error.message).split("\n")[0]
            : "FDC request failed",
      });
    }
  }

  return (
    <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        Independently attest this agent via Flare FDC
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        LedgerGuard reads the AssetManager and writes the ranking hash on-chain
        (see “Anchor ranking” above — a real signed tx). The third Flare
        primitive is the <span className="num">Data Connector (FDC)</span>: it
        lets anyone request an independent attestation of off-chain data. This
        button submits a real, signed{" "}
        <span className="num">FdcHub.requestAttestation(bytes)</span> request
        (verified live) asking Flare&apos;s verifier network to confirm the
        agent&apos;s public page. It succeeds when an FDC round is open for the
        type; if it reverts, the relay link below is the guaranteed path.
        LedgerGuard never holds your key.
      </p>

      {status.kind === "done" ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm text-[var(--color-good)]">FDC request submitted.</div>
          <a
            href={`${COSTON2_EXPLORER}/tx/${status.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="num break-all text-[11px] text-[var(--color-accent)] hover:underline"
          >
            {status.txHash}
          </a>
          <p className="text-[10px] text-[var(--color-faint)]">
            Flare&apos;s verifiers now process the round; the attested result is
            retrievable via the FDC explorer once complete.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={attest}
          disabled={status.kind === "working"}
          className="mt-4 bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-40"
        >
          {status.kind === "working" ? status.message : "Attest agent via FDC"}
        </button>
      )}

      {status.kind === "error" && (
        <div className="mt-3 text-xs text-[var(--color-bad)]">{status.message}</div>
      )}

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
          guaranteed path — FDC relay (prepares round + fee)
        </div>
        <a
          href={FDC_RELAY}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block break-all text-[11px] text-[var(--color-accent)] hover:underline"
        >
          {FDC_RELAY}
        </a>
        <p className="mt-2 text-[10px] text-[var(--color-faint)]">
          Attestation target: <span className="num">{agentUrl}</span>
        </p>
      </div>
    </div>
  );
}
