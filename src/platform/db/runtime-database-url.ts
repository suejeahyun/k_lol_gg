import { getServiceId, requireManagedCommunityId, SERVICE_BRAND } from "../../lib/service-brand";

export type DatabaseRuntimeEnvironment = Readonly<Record<string, string | undefined>> & Readonly<{
  NEXT_PUBLIC_SERVICE_ID?: string;
  DATABASE_URL?: string;
  NEXUS_DATABASE_URL?: string;
  HUB_DATABASE_URL?: string;
  COMMUNITY_DATABASE_URL?: string;
  NEXT_PUBLIC_COMMUNITY_ID?: string;
}>;

/** Each deployment selects only its own database; missing configuration fails closed. */
function runtimeEnvironment(): DatabaseRuntimeEnvironment {
  // Pin the runtime to the same build-time service as the UI/cookies, even if a
  // deployment accidentally omits NEXT_PUBLIC_SERVICE_ID at server startup.
  return {
    NEXT_PUBLIC_SERVICE_ID: SERVICE_BRAND.id,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXUS_DATABASE_URL: process.env.NEXUS_DATABASE_URL,
    HUB_DATABASE_URL: process.env.HUB_DATABASE_URL,
    COMMUNITY_DATABASE_URL: process.env.COMMUNITY_DATABASE_URL,
    NEXT_PUBLIC_COMMUNITY_ID: SERVICE_BRAND.communityId,
  };
}

export function configuredRuntimeDatabaseUrl(environment: DatabaseRuntimeEnvironment = runtimeEnvironment()): string | undefined {
  const service = getServiceId(environment.NEXT_PUBLIC_SERVICE_ID);
  if (service === "community") {
    requireManagedCommunityId(environment.NEXT_PUBLIC_COMMUNITY_ID);
    return environment.COMMUNITY_DATABASE_URL;
  }
  if (service === "hub") return environment.HUB_DATABASE_URL;
  return service === "nexus" ? environment.NEXUS_DATABASE_URL : environment.DATABASE_URL;
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
  const service = getServiceId(environment.NEXT_PUBLIC_SERVICE_ID);
  const name = service === "community" ? "COMMUNITY_DATABASE_URL" : service === "hub" ? "HUB_DATABASE_URL" : service === "nexus" ? "NEXUS_DATABASE_URL" : "DATABASE_URL";
  const value = configuredRuntimeDatabaseUrl(environment);
  if (!value) throw new Error(`${name} is not configured for this server runtime.`);
  postgresUrl(value, name);
  if (service === "nexus" && environment.DATABASE_URL && databaseTargetIdentity(value) === databaseTargetIdentity(environment.DATABASE_URL)) {
    throw new Error("NEXUS_DATABASE_URL must identify a different database from DATABASE_URL.");
  }
  if (service === "hub") {
    for (const childName of ["DATABASE_URL", "NEXUS_DATABASE_URL"] as const) {
      const childUrl = environment[childName];
      if (childUrl && databaseTargetIdentity(value) === databaseTargetIdentity(childUrl)) {
        throw new Error(`HUB_DATABASE_URL must identify a different database from ${childName}.`);
      }
    }
  }
  if (service === "community") {
    for (const peerName of ["DATABASE_URL", "NEXUS_DATABASE_URL", "HUB_DATABASE_URL"] as const) {
      const peerUrl = environment[peerName];
      if (peerUrl && databaseTargetIdentity(value) === databaseTargetIdentity(peerUrl)) {
        throw new Error(`COMMUNITY_DATABASE_URL must identify a different database from ${peerName}.`);
      }
    }
  }
  return value;
}
