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
  buildFdcCastCommand,
  encodeFdcRequest,
  encodeUrlMessage,
  fdcRequestCalldata,
} from "@/lib/flare/fdc";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const COSTON2_HEX = "0x72"; // 114

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "done"; txHash: Hex }
  | { kind: "error"; message: string };

/**
 * Independently attest the recommended agent via Flare's Data Connector (FDC) —
 * as a REAL signed transaction, not a copy-paste command.
 *
 * This makes FDC the enabler of the trust story rather than a side note:
 * clicking submits an on-chain request to FdcHub.requestAttestation(bytes)
 * (VERIFIED present on Coston2), and Flare's verifier network then attests the
 * agent's public page. LedgerGuard never holds a key; the user signs.
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

      setStatus({ kind: "working", message: "Confirm in your wallet — FDC request fee…" });
      const txHash = await wallet.sendTransaction({
        to: FDC_HUB,
        data,
        value: 10_000_000_000_000_000n, // 0.01 C2FLR toward the FDC request fee
      });

      setStatus({ kind: "working", message: "Waiting for confirmation…" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");

      setStatus({ kind: "done", txHash });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message.split("\n")[0] : "FDC request failed",
      });
    }
  }

  return (
    <div className="mt-4 border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        Independently attest this agent via Flare FDC
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        LedgerGuard reads the AssetManager and writes the ranking hash on-chain.
        Flare&apos;s Data Connector (FDC) is the third primitive: it lets anyone
        request an attestation of off-chain data. Clicking submits a real, signed
        request to <span className="num">FdcHub.requestAttestation(bytes)</span>{" "}
        (verified live on Coston2) asking Flare&apos;s verifier network to
        independently confirm the agent&apos;s public page — so &quot;verifiable&quot;
        extends beyond chain state. LedgerGuard never holds your key.
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

      <div className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
            copy-ready command (run from your wallet console)
          </span>
        </div>
        <pre className="num mt-2 whitespace-pre-wrap break-all text-[11px] text-[var(--color-text)]">
          {buildFdcCastCommand(data)}
        </pre>
        <p className="mt-1 text-[10px] text-[var(--color-faint)]">
          If the in-app button reverts (e.g. FDC fee/round not configured in your
          environment), submit this from a wallet console — the relay is reachable
          from your machine.
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">target</dt>
          <dd className="num text-[var(--color-text)]">FdcHub {FDC_HUB.slice(0, 8)}…</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">attests</dt>
          <dd className="num text-[var(--color-text)]">{agentUrl.slice(0, 28)}…</dd>
        </div>
      </dl>
    </div>
  );
}
