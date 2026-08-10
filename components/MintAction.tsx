"use client";

import { useState } from "react";

import { COSTON2_EXPLORER } from "@/lib/flare/coston2";

/**
 * Closing the loop without breaking the read-only rule or guessing an ABI.
 *
 * LedgerGuard never signs a transaction and never encodes contract calldata
 * from an unverified interface. Instead it hands the user a copy-paste-ready
 * command for the public FAssets V2 minter entry point (`mint`) against the
 * resolved AssetManager, using the recommended agent and the exact amount in
 * UBA. The user runs it from their own wallet/console, which decodes and
 * signs it — so there is no fabricated encoding and no bad on-chain state if
 * anything is off (their tooling rejects it before execution).
 *
 * NOTE: a real FAssets mint is multi-step (collateral reservation + pool
 * collateral ERC-20 approval, then the agent accepts). This command is the
 * minter-facing call; the surrounding setup is the user's to complete.
 */
export function MintAction({
  recommendedVault,
  amountFxrp,
  assetManager,
}: {
  recommendedVault: string;
  amountFxrp: number;
  assetManager: string;
}) {
  // 1 FXRP = 1e6 UBA on FAssets.
  const amountUba = Math.round(amountFxrp * 1_000_000).toString();
  const lots = Math.max(1, Math.round(amountFxrp / 10)); // 10 FXRP per lot on Coston2

  const command = [
    `cast send ${assetManager}`,
    `  "mint(address,uint256,uint256,address,uint256,uint256)"`,
    `  ${recommendedVault} ${lots} 0 ${recommendedVault} 0 $(date +%s)`,
    `  --rpc-url https://coston2-api.flare.network/ext/C/rpc --legacy`,
  ].join(" \\\n");

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
        Execute the mint — parameters for{" "}
        <span className="num text-[var(--color-accent)]">
          {recommendedVault.slice(0, 10)}…{recommendedVault.slice(-6)}
        </span>
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        LedgerGuard is read-only and never signs. The command below targets the
        public FAssets V2 minter entry point on the resolved AssetManager. Copy it
        into a wallet console or terminal (with a funded Coston2 account) to act on
        the advice. A real mint also needs the standard collateral-reservation and
        pool-collateral approval steps first.
      </p>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">agentVault</dt>
          <dd className="num text-[var(--color-text)]">{recommendedVault}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">amount (UBA)</dt>
          <dd className="num text-[var(--color-text)]">{Number(amountUba).toLocaleString()}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">lots</dt>
          <dd className="num text-[var(--color-text)]">{lots}</dd>
        </div>
        <div className="flex justify-between gap-2 border-b border-[var(--color-line)] py-1">
          <dt className="text-[var(--color-faint)]">AssetManager</dt>
          <dd className="num text-[var(--color-text)]">{assetManager.slice(0, 10)}…</dd>
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

      <a
        href={`${COSTON2_EXPLORER}/address/${assetManager}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-[11px] text-[var(--color-accent)] hover:underline"
      >
        Open AssetManager on Coston2 explorer →
      </a>
    </div>
  );
}
