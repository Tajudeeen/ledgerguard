"use client";

import { useEffect, useState } from "react";

/**
 * A short splash: the LedgerGuard wordmark, its flame gradient, and the motto,
 * over a flame wipe. Auto-dismisses after ~1.8s and is skippable by tap/key.
 * Respects prefers-reduced-motion (renders nothing extra; the app shows at once).
 */
export function Splash() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setDone(true), 1800);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") setDone(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (done) return null;

  return (
    <div
      className="splash-fade fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]"
      onClick={() => setDone(true)}
      role="presentation"
    >
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="flare-bar splash-wipe absolute left-0 top-1/2 w-full" />
          <div className="ember flare-text text-5xl font-bold tracking-tight">LG</div>
        </div>
        <div>
          <div className="flare-text text-2xl font-semibold tracking-tight">LedgerGuard</div>
          <div className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
            Risk-aware collateral intelligence for FXRP - read from Flare, ranked
            by math, anchored on Coston2.
          </div>
        </div>
        <div className="num text-[11px] text-[var(--color-faint)]">flare · coston2 · fassets</div>
      </div>
    </div>
  );
}
