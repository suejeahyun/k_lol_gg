import { readFile } from "node:fs/promises";

const catalogPath = new URL("../../src/modules/champions/domain/data-dragon-catalog.ts", import.meta.url);
const catalogSource = await readFile(catalogPath, "utf8");
const pinnedVersion = catalogSource.match(/DATA_DRAGON_VERSION\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/u)?.[1];

if (!pinnedVersion) throw new Error("DATA_DRAGON_VERSION_NOT_FOUND");

const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`DATA_DRAGON_VERSION_CHECK_HTTP_${response.status}`);

const versions = await response.json();
if (!Array.isArray(versions) || !versions.every((value) => typeof value === "string")) {
  throw new Error("DATA_DRAGON_VERSION_CHECK_INVALID_RESPONSE");
}
if (!versions.includes(pinnedVersion)) throw new Error("DATA_DRAGON_PINNED_VERSION_UNAVAILABLE");

const latestVersion = versions[0] ?? pinnedVersion;
process.stdout.write(JSON.stringify({
  pinnedVersion,
  latestVersion,
  updateAvailable: latestVersion !== pinnedVersion,
  action: latestVersion === pinnedVersion ? "catalog-current" : "review-catalog-update",
}) + "\n");
