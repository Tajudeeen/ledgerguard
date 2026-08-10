import { createPublicClient, http, isAddress, type Address } from "viem";
import { flareTestnet } from "viem/chains";

/**
 * The Flare Contract Registry is the ONE address LedgerGuard hardcodes.
 * It is the canonical, immutable entry point deployed at the same address on
 * every Flare network. Every other contract is resolved through it at runtime,
 * so an AssetManager redeploy does not break LedgerGuard.
 * Verified live on Coston2 (chainId 114).
 */
export const COSTON2_CONTRACT_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as const satisfies Address;

/** Registry lookup key for the FXRP asset manager on Coston2. */
export const ASSET_MANAGER_REGISTRY_KEY = "AssetManagerFXRP" as const;

export const COSTON2_CHAIN_ID = 114;

export const COSTON2_DEFAULT_RPC = "https://coston2-api.flare.network/ext/C/rpc";

export const COSTON2_EXPLORER = "https://coston2.testnet.flarescan.com";

export const coston2Client = createPublicClient({
  chain: flareTestnet,
  transport: http(process.env.COSTON2_RPC_URL ?? COSTON2_DEFAULT_RPC),
});

export function asContractAddress(value: string, label: string): Address {
  if (!isAddress(value) || value === "0x0000000000000000000000000000000000000000") {
    throw new Error(`${label} resolved to an invalid address: ${value}`);
  }

  return value;
}
