import { iAssetManagerAbi } from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IAssetManager";
import { iFlareContractRegistryAbi } from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2/IFlareContractRegistry";
import type { Address } from "viem";

import {
  ASSET_MANAGER_REGISTRY_KEY,
  COSTON2_CHAIN_ID,
  COSTON2_CONTRACT_REGISTRY,
  asContractAddress,
  coston2Client,
} from "../flare/coston2";
import type {
  AgentSnapshot,
  CollateralTypeInfo,
  DirectMintingLimiter,
  FxrpAgentSnapshotResult,
} from "../types/agent";

/** getAvailableAgentsDetailedList takes (_start, _end) — an index window, not a count. */
const PAGE_SIZE = 50n;

const COLLATERAL_CLASS_POOL = 1;
const COLLATERAL_CLASS_VAULT = 2;

type AvailableAgentDetail = {
  agentVault: Address;
  ownerManagementAddress: Address;
  feeBIPS: bigint;
  mintingVaultCollateralRatioBIPS: bigint;
  mintingPoolCollateralRatioBIPS: bigint;
  freeCollateralLots: bigint;
  status: number;
};

type AgentInfo = {
  status: number;
  ownerManagementAddress: Address;
  feeBIPS: bigint;
  vaultCollateralToken: Address;
  freeCollateralLots: bigint;
  totalVaultCollateralWei: bigint;
  vaultCollateralRatioBIPS: bigint;
  poolWNatToken: Address;
  totalPoolCollateralNATWei: bigint;
  poolCollateralRatioBIPS: bigint;
  mintedUBA: bigint;
  reservedUBA: bigint;
  redeemingUBA: bigint;
  poolRedeemingUBA: bigint;
};

type RawCollateralType = {
  collateralClass: number;
  token: Address;
  decimals: bigint;
  tokenFtsoSymbol: string;
  assetFtsoSymbol: string;
  minCollateralRatioBIPS: bigint;
  safetyMinCollateralRatioBIPS: bigint;
  validUntil: bigint;
};

function toCollateralTypeInfo(raw: RawCollateralType): CollateralTypeInfo {
  return {
    collateralClass: Number(raw.collateralClass),
    token: raw.token,
    decimals: raw.decimals,
    tokenFtsoSymbol: raw.tokenFtsoSymbol,
    assetFtsoSymbol: raw.assetFtsoSymbol,
    minCollateralRatioBIPS: raw.minCollateralRatioBIPS,
    safetyMinCollateralRatioBIPS: raw.safetyMinCollateralRatioBIPS,
  };
}

/**
 * Combines the cheap list entry with the full getAgentInfo record.
 * The two calls are cross-checked so a paging or reorg mismatch fails loudly
 * rather than silently producing a snapshot for the wrong agent.
 */
export function normalizeAgentSnapshot(
  detail: AvailableAgentDetail,
  info: AgentInfo,
  lotSizeAMG: bigint,
  assetMintingGranularityUBA: bigint,
): AgentSnapshot {
  if (
    detail.ownerManagementAddress.toLowerCase() !==
    info.ownerManagementAddress.toLowerCase()
  ) {
    throw new Error(`Agent detail/info mismatch for ${detail.agentVault}`);
  }

  return {
    agentVault: detail.agentVault,
    ownerManagementAddress: detail.ownerManagementAddress,
    status: Number(info.status),
    feeBIPS: info.feeBIPS,
    freeCollateralLots: info.freeCollateralLots,
    availableCapacityUBA:
      info.freeCollateralLots * lotSizeAMG * assetMintingGranularityUBA,
    vaultCollateralToken: info.vaultCollateralToken,
    vaultCollateralRatioBIPS: info.vaultCollateralRatioBIPS,
    totalVaultCollateralWei: info.totalVaultCollateralWei,
    poolWNatToken: info.poolWNatToken,
    poolCollateralRatioBIPS: info.poolCollateralRatioBIPS,
    totalPoolCollateralNATWei: info.totalPoolCollateralNATWei,
    mintedUBA: info.mintedUBA,
    reservedUBA: info.reservedUBA,
    redeemingUBA: info.redeemingUBA,
    poolRedeemingUBA: info.poolRedeemingUBA,
  };
}

/**
 * Reads the live Core Vault direct-minting rate limiter from the AssetManager.
 *
 * Under the current FAssets model the mint is a direct XRPL payment to the Core
 * Vault finalised by an executor; the AssetManager throttles direct minting with
 * hourly and daily windows plus a "large minting" delay. These getters take no
 * arguments and are pinned to `blockNumber` like every other read, so the
 * limiter snapshot is reproducible from the same block as the agent view.
 */
async function readDirectMintingLimiter(
  assetManager: Address,
  blockNumber: bigint,
): Promise<DirectMintingLimiter> {
  const scalar = (fn: string): Promise<bigint> =>
    coston2Client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: fn as "getDirectMintingHourlyLimitUBA",
      blockNumber,
    }) as Promise<bigint>;

  const [hourly, daily, hourlyState, dailyState, largeThresh, largeDelay, unblock, execFee] =
    await Promise.all([
      scalar("getDirectMintingHourlyLimitUBA"),
      scalar("getDirectMintingDailyLimitUBA"),
      coston2Client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getDirectMintingHourlyLimiterState",
        blockNumber,
      }) as Promise<readonly [bigint, bigint]>,
      coston2Client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getDirectMintingDailyLimiterState",
        blockNumber,
      }) as Promise<readonly [bigint, bigint]>,
      scalar("getDirectMintingLargeMintingThresholdUBA"),
      scalar("getDirectMintingLargeMintingDelaySeconds"),
      scalar("getDirectMintingsUnblockUntilTimestamp"),
      scalar("getDirectMintingExecutorFeeUBA"),
    ]);

  return {
    hourlyLimitUBA: hourly,
    dailyLimitUBA: daily,
    hourlyMintedUBA: hourlyState[1],
    dailyMintedUBA: dailyState[1],
    largeMintingThresholdUBA: largeThresh,
    largeMintingDelaySeconds: largeDelay,
    unblockUntilTimestamp: unblock,
    executorFeeBIPS: execFee,
  };
}

/**
 * Live Coston2 read path:
 *   Contract Registry -> AssetManagerFXRP -> getSettings
 *                                         -> getCollateralTypes
 *                                         -> getAvailableAgentsDetailedList
 *                                         -> getAgentInfo (per agent)
 *                                         -> getDirectMinting* (Core Vault limiter)
 *
 * Every call is pinned to a single block number so the resulting snapshot is
 * internally consistent and independently reproducible by a third party.
 */
export async function readFxrpAgentSnapshots(
  atBlock?: bigint,
): Promise<FxrpAgentSnapshotResult> {
  const block = await coston2Client.getBlock(
    atBlock === undefined ? {} : { blockNumber: atBlock },
  );
  const blockNumber = block.number!;

  const resolvedAssetManager = await coston2Client.readContract({
    address: COSTON2_CONTRACT_REGISTRY,
    abi: iFlareContractRegistryAbi,
    functionName: "getContractAddressByName",
    args: [ASSET_MANAGER_REGISTRY_KEY],
    blockNumber,
  });
  const assetManager = asContractAddress(
    resolvedAssetManager,
    ASSET_MANAGER_REGISTRY_KEY,
  );

  const [settings, collateralTypes, firstPage, limiter] = await Promise.all([
    coston2Client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "getSettings",
      blockNumber,
    }),
    coston2Client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "getCollateralTypes",
      blockNumber,
    }),
    coston2Client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "getAvailableAgentsDetailedList",
      args: [0n, PAGE_SIZE],
      blockNumber,
    }),
    readDirectMintingLimiter(assetManager, blockNumber),
  ]);

  const allTypes = (collateralTypes as readonly RawCollateralType[]).map(
    toCollateralTypeInfo,
  );
  const poolCollateralType = allTypes.find(
    (t) => t.collateralClass === COLLATERAL_CLASS_POOL,
  );
  if (!poolCollateralType) {
    throw new Error("AssetManager exposes no pool (class 1) collateral type");
  }
  const vaultCollateralTypes = allTypes.filter(
    (t) => t.collateralClass === COLLATERAL_CLASS_VAULT,
  );

  const totalLength = firstPage[1];
  const detailedAgents: AvailableAgentDetail[] = [
    ...(firstPage[0] as readonly AvailableAgentDetail[]),
  ];
  for (let start = PAGE_SIZE; start < totalLength; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE > totalLength ? totalLength : start + PAGE_SIZE;
    const page = await coston2Client.readContract({
      address: assetManager,
      abi: iAssetManagerAbi,
      functionName: "getAvailableAgentsDetailedList",
      args: [start, end],
      blockNumber,
    });
    detailedAgents.push(...(page[0] as readonly AvailableAgentDetail[]));
  }

  const snapshots = await Promise.all(
    detailedAgents.map(async (detail) => {
      const info = (await coston2Client.readContract({
        address: assetManager,
        abi: iAssetManagerAbi,
        functionName: "getAgentInfo",
        args: [detail.agentVault],
        blockNumber,
      })) as unknown as AgentInfo;

      return normalizeAgentSnapshot(
        detail,
        info,
        settings.lotSizeAMG,
        settings.assetMintingGranularityUBA,
      );
    }),
  );

  // Deterministic ordering by vault address, independent of chain enumeration order.
  snapshots.sort((a, b) =>
    a.agentVault.toLowerCase() < b.agentVault.toLowerCase() ? -1 : 1,
  );

  return {
    chainId: COSTON2_CHAIN_ID,
    assetManager,
    blockNumber,
    blockTimestamp: block.timestamp,
    lotSizeAMG: settings.lotSizeAMG,
    assetMintingGranularityUBA: settings.assetMintingGranularityUBA,
    assetUnitUBA: settings.assetUnitUBA,
    assetDecimals: Number(settings.assetDecimals),
    vaultCollateralTypes,
    poolCollateralType,
    snapshots,
    directMinting: limiter,
  };
}
