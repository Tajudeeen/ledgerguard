/**
 * Compiles contracts/RankingAttestation.sol with solc and writes the artifact
 * to build/RankingAttestation.json.
 *
 *   node script/compile.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "RankingAttestation.sol";
const source = readFileSync(join(root, "contracts", SOURCE), "utf8");

const input = {
  language: "Solidity",
  sources: { [SOURCE]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length > 0) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of output.errors ?? []) console.warn(w.formattedMessage.trim());

const contract = output.contracts[SOURCE].RankingAttestation;
const artifact = {
  contractName: "RankingAttestation",
  solcVersion: solc.version(),
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "paris",
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};

mkdirSync(join(root, "build"), { recursive: true });
writeFileSync(
  join(root, "build", "RankingAttestation.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
);

console.log("compiled with", artifact.solcVersion);
console.log("bytecode bytes:", (artifact.bytecode.length - 2) / 2);
console.log("-> build/RankingAttestation.json");
