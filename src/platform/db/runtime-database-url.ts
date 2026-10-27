import { getServiceBrand, SERVICE_BRAND } from "../../lib/service-brand";

export type DatabaseRuntimeEnvironment = Readonly<Record<string, string | undefined>> & Readonly<{
  NEXT_PUBLIC_SERVICE_ID?: string;
  DATABASE_URL?: string;
  NEXUS_DATABASE_URL?: string;
}>;

/** Selection is explicit: a missing NEXUS URL can never select the K-LOL DB. */
function runtimeEnvironment(): DatabaseRuntimeEnvironment {
  // Pin the runtime to the same build-time service as the UI/cookies, even if a
  // deployment accidentally omits NEXT_PUBLIC_SERVICE_ID at server startup.
  return { NEXT_PUBLIC_SERVICE_ID: SERVICE_BRAND.id, DATABASE_URL: process.env.DATABASE_URL, NEXUS_DATABASE_URL: process.env.NEXUS_DATABASE_URL };
}

export function configuredRuntimeDatabaseUrl(environment: DatabaseRuntimeEnvironment = runtimeEnvironment()): string | undefined {
  return getServiceBrand(environment.NEXT_PUBLIC_SERVICE_ID ?? "klol").id === "nexus"
    ? environment.NEXUS_DATABASE_URL
    : environment.DATABASE_URL;
}

function postgresUrl(value: string, name: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`${name} must be a valid PostgreSQL URL.`); }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must use the PostgreSQL protocol.`);
  }
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error(`${name} must identify a PostgreSQL server and database.`);
  }
  return url;
}

export function databaseTargetIdentity(value: string): string {
  const url = postgresUrl(value, "Database URL");
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? "loopback"
    : url.hostname.endsWith(".neon.tech") ? url.hostname.replace(/-pooler(?=\.)/u, "") : url.hostname;
  return `${host}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
}

export function requireRuntimeDatabaseUrl(environment: DatabaseRuntimeEnvironment = runtimeEnvironment()): string {
  const nexus = getServiceBrand(environment.NEXT_PUBLIC_SERVICE_ID ?? "klol").id === "nexus";
  const name = nexus ? "NEXUS_DATABASE_URL" : "DATABASE_URL";
  const value = configuredRuntimeDatabaseUrl(environment);
  if (!value) throw new Error(`${name} is not configured for this server runtime.`);
  postgresUrl(value, name);
  if (nexus && environment.DATABASE_URL && databaseTargetIdentity(value) === databaseTargetIdentity(environment.DATABASE_URL)) {
    throw new Error("NEXUS_DATABASE_URL must identify a different database from DATABASE_URL.");
  }
  return value;
}
