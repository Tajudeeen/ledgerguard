import type { Address } from "viem";

/**
 * Every field below is read directly from the Coston2 FXRP AssetManager.
 * Nothing here is inferred, estimated, or invented.
 *
 * Conventions used by the FAssets protocol:
 *  - BIPS: 10_000 = 100% = 1.00x collateral ratio.
 *  - UBA:  the underlying asset's smallest unit (XRP drops, 6 decimals).
 *  - AMG:  asset minting granularity units; 1 AMG = assetMintingGranularityUBA UBA.
 */

/** Collateral thresholds are a property of the COLLATERAL TYPE, not the agent. */
export type CollateralTypeInfo = {
  collateralClass: number; // 1 = pool (WNat), 2 = vault (ERC20)
  token: Address;
  decimals: bigint;
  tokenFtsoSymbol: string;
  assetFtsoSymbol: string;
  /** Below this ratio the agent can be liquidated. */
  minCollateralRatioBIPS: bigint;
  /** Liquidation stops once the agent is restored to this ratio. */
  safetyMinCollateralRatioBIPS: bigint;
};

/**
 * A single available agent as observed at one block.
 *
 * An FAssets agent is backed by TWO independent collateral legs, each with its
 * own ratio and its own liquidation threshold. The agent's real risk is the
 * WEAKER of the two legs, so both are carried through the pipeline.
 */
export type AgentSnapshot = {
  agentVault: Address;
  ownerManagementAddress: Address;
  status: number;

  /** Minting fee charged by this agent, in BIPS of the minted amount. */
  feeBIPS: bigint;

  /** Free lots the agent can currently back. 1 lot = lotSizeAMG * granularity UBA. */
  freeCollateralLots: bigint;
  availableCapacityUBA: bigint;

  // --- vault collateral leg (ERC20, e.g. testUSDT) ---
  vaultCollateralToken: Address;
  vaultCollateralRatioBIPS: bigint;
  totalVaultCollateralWei: bigint;

  // --- pool collateral leg (WNat / C2FLR) ---
  poolWNatToken: Address;
  poolCollateralRatioBIPS: bigint;
  totalPoolCollateralNATWei: bigint;

  // --- backed asset exposure ---
  mintedUBA: bigint;
  reservedUBA: bigint;
  redeemingUBA: bigint;
  poolRedeemingUBA: bigint;
};

/** Result of one complete read of chain state, pinned to a single block. */
export type FxrpAgentSnapshotResult = {
  chainId: number;
  assetManager: Address;
  blockNumber: bigint;
  blockTimestamp: bigint;

  lotSizeAMG: bigint;
  assetMintingGranularityUBA: bigint;
  assetUnitUBA: bigint;
  assetDecimals: number;

  vaultCollateralTypes: CollateralTypeInfo[];
  poolCollateralType: CollateralTypeInfo;

  snapshots: AgentSnapshot[];
};
