"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  type Hex,
} from "viem";
import { flareTestnet } from "viem/chains";

import type { RankingView } from "@/lib/utils/view";
import { ATTESTATION_ABI } from "@/lib/attestation/abi";
import { COSTON2_EXPLORER } from "@/lib/flare/coston2";

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
  | { kind: "done"; txHash: Hex; id: string }
  | { kind: "error"; message: string };

/**
 * Anchors the snapshot hash on Coston2 via the user's wallet. LedgerGuard
 * never holds a key: the user signs the attestation themselves, which is what
 * makes the record attributable.
 */
export function AnchorButton({
  view,
  contractAddress,
}: {
  view: RankingView;
  contractAddress: string | null;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  if (!contractAddress) {
    return (
      <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-muted)]">
        RankingAttestation is not deployed for this environment, so anchoring is
        unavailable. The snapshot hash above is still fully reproducible.
      </div>
    );
  }

  const target = contractAddress;

  async function anchor() {
    if (!window.ethereum) {
      setStatus({ kind: "error", message: "No injected wallet found. Install MetaMask." });
      return;
    }

    try {
      setStatus({ kind: "working", message: "Connecting wallet…" });
      const provider = window.ethereum;
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
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

      setStatus({ kind: "working", message: "Confirm the transaction in your wallet…" });

      const data = encodeFunctionData({
        abi: ATTESTATION_ABI,
        functionName: "attest",
        args: [
          view.snapshotHash as Hex,
          BigInt(view.blockNumber),
          view.agentsAnalyzed,
          BigInt(view.mintAmountUBA),
          (view.recommendedVault ??
            "0x0000000000000000000000000000000000000000") as `0x${string}`,
        ],
      });

      const txHash = await wallet.sendTransaction({
        to: target as `0x${string}`,
        data,
      });

      setStatus({ kind: "working", message: "Waiting for confirmation…" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");

      // The attestation id is the first indexed topic of RankingAttested.
      const log = receipt.logs.find(
        (l) => l.address.toLowerCase() === target.toLowerCase(),
      );
      const id = log?.topics[1] ? BigInt(log.topics[1]).toString() : "0";

      // Persist the receipt so /verdict/[id] can render it.
      await fetch("/api/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, txHash, view }),
      });

      setStatus({ kind: "done", txHash, id });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message.split("\n")[0] : "Anchoring failed",
      });
    }
  }

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
        On-chain attestation
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--color-muted)]">
        Anchoring writes only the snapshot hash, block, agent count, mint amount
        and recommended agent to Coston2. Anyone can later re-read the
        AssetManager at block{" "}
        <span className="num text-[var(--color-text)]">{view.blockNumber}</span>, re-run
        this scoring engine, and check that it reproduces the same hash.
      </p>

      {status.kind === "done" ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm text-[var(--color-good)]">Attestation confirmed.</div>
          <Field label="tx" value={status.txHash} href={`${COSTON2_EXPLORER}/tx/${status.txHash}`} />
          <a
            href={`/verdict/${status.id}`}
            className="inline-block border border-[var(--color-accent)] px-4 py-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black"
          >
            Open receipt →
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={anchor}
          disabled={status.kind === "working"}
          className="mt-4 bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-40"
        >
          {status.kind === "working" ? status.message : "Anchor ranking on Coston2"}
        </button>
      )}

      {status.kind === "error" && (
        <div className="mt-3 text-xs text-[var(--color-bad)]">{status.message}</div>
      )}
    </div>
  );
}

function Field({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-8 shrink-0 text-[var(--color-faint)]">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="num break-all text-[var(--color-accent)] hover:underline"
      >
        {value}
      </a>
    </div>
  );
}
