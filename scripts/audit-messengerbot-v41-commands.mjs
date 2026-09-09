import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(await readFile(resolve(root, "integrations/messengerbot-r/command-parity-contract.json"), "utf8"));
const names = new Set();
const samples = new Set();
const byDomain = new Map();

for (const command of contract.commands) {
  if (names.has(command.name)) throw new Error(`duplicate command name: ${command.name}`);
  if (samples.has(command.sample)) throw new Error(`duplicate command sample: ${command.sample}`);
  names.add(command.name);
  samples.add(command.sample);
  byDomain.set(command.domain, (byDomain.get(command.domain) ?? 0) + 1);
}

console.log(`MessengerBot R command contract: ${contract.commands.length}`);
for (const [domain, count] of [...byDomain].sort()) console.log(`${domain}: ${count}`);
