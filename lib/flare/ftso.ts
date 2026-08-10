import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

import { COSTON2_CONTRACT_REGISTRY } from "./coston2";

/**
 * Flare FTSO V2 — the network's price oracle. LedgerGuard reads the live XRP/USD
 * feed to show the market price the AssetManager itself uses for collateral
 * valuation, and to anchor the stress-test narrative ("XRP is trading at $X").
 *
 * Verified against Coston2: the FtsoV2 contract resolves from the registry and
 * `getFeedById` is callable, but on the Coston2 *testnet* RPC the feed values
 * are frequently not populated (returns 0 / near-epoch timestamp). We therefore
 * treat a zero or stale value as "oracle not served here" and surface that
 * honestly rather than presenting a fake price. The stress test itself does not
 * depend on this feed — it operates on on-chain ratios directly.
 */

export const FTSO_FEED_XRP_USD =
  "0x015852502f55534400000000000000000000000000" as const; // "XRP/USD"

export type OracleReading = {
  ftsoV2: string;
  feedId: string;
  /** price in USD, or null when the feed is unavailable on this network. */
  priceUsd: number | null;
  /** seconds since the feed's last update; null when unavailable. */
  ageSeconds: number | null;
  /** true when priceUsd is present and recent. */
  fresh: boolean;
};

const MAX_FRESH_AGE_S = 300; // 5 minutes

export async function readXrpUsdOracle(atBlock?: bigint): Promise<OracleReading> {
  const client = createPublicClient({ chain: flareTestnet, transport: http() });
  try {
    const ftsoV2 = (await client.readContract({
      address: COSTON2_CONTRACT_REGISTRY,
      abi: [
        {
          type: "function",
          name: "getContractAddressByName",
          inputs: [{ name: "name", type: "string" }],
          outputs: [{ name: "", type: "address" }],
          stateMutability: "view",
        },
      ],
      functionName: "getContractAddressByName",
      args: ["FtsoV2"],
      blockNumber: atBlock,
    })) as `0x${string}`;

    const [value, timestamp, decimals] = (await client.readContract({
      address: ftsoV2,
      abi: [
        {
          type: "function",
          name: "getFeedById",
          inputs: [{ name: "_feedId", type: "bytes21" }],
          outputs: [
            { name: "_value", type: "uint256" },
            { name: "_timestamp", type: "uint64" },
            { name: "_decimals", type: "uint8" },
          ],
          stateMutability: "view",
        },
      ],
      functionName: "getFeedById",
      args: [FTSO_FEED_XRP_USD],
      blockNumber: atBlock,
    })) as [bigint, bigint, number];

    const priceUsd = value > 0n ? Number(value) / 10 ** decimals : null;
    const ageSeconds =
      timestamp > 0n ? Math.max(0, Math.floor(Date.now() / 1000) - Number(timestamp)) : null;
    const fresh = priceUsd !== null && ageSeconds !== null && ageSeconds <= MAX_FRESH_AGE_S;

    return {
      ftsoV2,
      feedId: FTSO_FEED_XRP_USD,
      priceUsd,
      ageSeconds,
      fresh,
    };
  } catch {
    return {
      ftsoV2: "0x0000000000000000000000000000000000000000",
      feedId: FTSO_FEED_XRP_USD,
      priceUsd: null,
      ageSeconds: null,
      fresh: false,
    };
  }
}
