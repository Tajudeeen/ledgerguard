/**
 * Deploys RankingAttestation to Coston2.
 *
 *   DEPLOYER_PRIVATE_KEY=0x... node script/deploy.mjs
 *
 * Writes the resulting address and tx hash to deployments/coston2.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flareTestnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";

const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) {
  console.error("DEPLOYER_PRIVATE_KEY is not set");
  process.exit(1);
}

const artifact = JSON.parse(
  readFileSync(join(root, "build", "RankingAttestation.json"), "utf8"),
);

const account = privateKeyToAccount(key);
const publicClient = createPublicClient({ chain: flareTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: flareTestnet, transport: http(RPC) });

const chainId = await publicClient.getChainId();
if (chainId !== 114) {
  console.error(`Expected Coston2 (114), got chainId ${chainId}`);
  process.exit(1);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log("deployer :", account.address);
console.log("balance  :", formatEther(balance), "C2FLR");
if (balance === 0n) {
  console.error("\nDeployer has no C2FLR. Fund it at https://faucet.flare.network/coston2");
  process.exit(1);
}

const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [],
});
console.log("deploy tx:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  console.error("Deployment reverted");
  process.exit(1);
}

const record = {
  network: "coston2",
  chainId,
  address: receipt.contractAddress,
  deploymentTx: hash,
  blockNumber: Number(receipt.blockNumber),
  deployer: account.address,
  solcVersion: artifact.solcVersion,
  abi: artifact.abi,
};

mkdirSync(join(root, "deployments"), { recursive: true });
writeFileSync(
  join(root, "deployments", "coston2.json"),
  `${JSON.stringify(record, null, 2)}\n`,
);

console.log("address  :", receipt.contractAddress);
console.log("block    :", receipt.blockNumber);
console.log("explorer : https://coston2.testnet.flarescan.com/address/" + receipt.contractAddress);
console.log("-> deployments/coston2.json");
