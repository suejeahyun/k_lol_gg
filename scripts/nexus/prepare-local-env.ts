import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { nexusBootstrapTarget } from "./empty-database";

// Credentials stay in the ignored descriptor/environment and are never printed.
const descriptorPath = resolve(".private/nexus-local-database.json");
const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as { connectionString: string; database: string };
const target = nexusBootstrapTarget({
  NEXT_PUBLIC_SERVICE_ID: "nexus",
  NEXUS_DATABASE_URL: descriptor.connectionString,
  NEXUS_DATABASE_NAME: descriptor.database,
  NEXUS_BOOTSTRAP_CONFIRM: "CREATE_EMPTY_NEXUS",
});
const databaseHost = new URL(target.connectionString).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseHost)) throw new Error("Local preparation requires a loopback database descriptor.");
const randomSecret = () => randomBytes(32).toString("base64url");
const identitySecret = randomSecret();
const signingSecret = randomSecret();
const values: Record<string, string> = {
  NEXT_PUBLIC_SERVICE_ID: "nexus",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3107",
  V2_PUBLIC_ORIGIN: "http://localhost:3107",
  V2_PUBLIC_DATA_SOURCE: "postgres",
  NEXUS_DATABASE_URL: target.connectionString,
  NEXUS_DATABASE_NAME: target.databaseName,
  NEXUS_BOOTSTRAP_CONFIRM: "CREATE_EMPTY_NEXUS",
  DATABASE_POOL_MAX: "5",
  SESSION_SIGNING_KEYS: JSON.stringify({ current: "nexus-v1", keys: { "nexus-v1": randomSecret() } }),
  TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: randomSecret() } }),
  V2_AUTH_RATE_LIMIT_PEPPER: randomSecret(),
  V2_TEST_AUTH_ENABLED: "false",
  V2_RIOT_INTEGRATION_ENABLED: "false",
  V2_RIOT_FAKE_RUNTIME: "false",
  V2_OPENAI_COMPLETION_ENABLED: "false",
  V2_CRON_ENABLED: "false",
  OPERATIONS_JOB_SECRET: randomSecret(),
  CRON_SECRET: randomSecret(),
  KAKAO_WEBHOOK_SECRET_CURRENT: randomSecret(),
  KAKAO_WEBHOOK_KEY_ID_CURRENT: "nexus-current",
  KAKAO_V4_IDENTITY_SECRET: identitySecret,
  KAKAO_V4_WEBHOOK_SECRET_CURRENT: signingSecret,
  KAKAO_V4_WEBHOOK_KEY_ID_CURRENT: "nexus-v4-current",
  KAKAO_WEBHOOK_PRINCIPAL_ID: "bot:nexus",
  KAKAO_SITE_NOTICE_ENABLED: "false",
  USAGE_ANALYTICS_ENABLED: "false",
  USAGE_ANALYTICS_SECRET: randomSecret(),
  // Fill only after the new deployment's ownership and URL are verified.
  NEXUS_V2_BASE_URL: "",
  NEXUS_V4_KAKAO_IDENTITY_SECRET: identitySecret,
  NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT: signingSecret,
  NEXUS_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT: "nexus-v4-current",
};
// Single quotes preserve JSON and dollar signs for Next.js/node environment loading.
const content = "# Private NEXUS local environment. Never commit or share.\n" + Object.entries(values).map(([name, value]) => {
  if (/[\r\n']/u.test(value)) throw new Error("Local environment value cannot be represented safely.");
  return `${name}='${value.replaceAll("$", "\\$")}'`;
}).join("\n") + "\n";
await writeFile(resolve(".env.local"), content, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log("Private .env.local created with a dedicated local NEXUS database and independent keys. Existing files were not overwritten.");
