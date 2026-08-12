import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RankingView } from "./view";

/**
 * Receipts are cached to disk purely so /verdict/[id] can render the exact
 * ranking that was anchored without asking the user to re-run it.
 *
 * The cache is NOT the source of truth and is not trusted: the receipt page
 * independently reads the attestation back from Coston2 and recomputes the
 * hash of the cached ranking, then shows whether the two match. A tampered or
 * missing cache entry therefore cannot fake a verified receipt.
 */
const DIR = join(process.cwd(), ".receipts");

export type StoredReceipt = {
  id: string;
  txHash: string;
  /**
   * The full ranking at anchor time. May be null when a receipt was repaired
   * from the on-chain record alone (its detailed agent rows are not recoverable
   * from the contract). The verdict page still renders the verifiable on-chain
   * proof and clearly states the agent table is not cached.
   */
  view: RankingView | null;
  storedAt: number;
};

function isSafeId(id: string): boolean {
  return /^[0-9]{1,20}$/.test(id);
}

export async function saveReceipt(receipt: StoredReceipt): Promise<void> {
  if (!isSafeId(receipt.id)) throw new Error("Invalid receipt id");
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${receipt.id}.json`), JSON.stringify(receipt), "utf8");
}

export async function loadReceipt(id: string): Promise<StoredReceipt | null> {
  if (!isSafeId(id)) return null;
  try {
    return JSON.parse(await readFile(join(DIR, `${id}.json`), "utf8")) as StoredReceipt;
  } catch {
    return null;
  }
}

/** Whether a receipt cache file exists for this id (cheap existence check). */
export async function existsReceipt(id: string): Promise<boolean> {
  if (!isSafeId(id)) return false;
  try {
    await readFile(join(DIR, `${id}.json`), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function listReceiptIds(): Promise<string[]> {
  try {
    const files = await readdir(DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => Number(b) - Number(a));
  } catch {
    return [];
  }
}

/** Returns the stored ranking view for an attestation id, or null. */
export async function loadRankingView(id: string) {
  const receipt = await loadReceipt(id);
  return receipt?.view ?? null;
}
