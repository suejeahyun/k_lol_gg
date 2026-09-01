export type TestDatabaseGuardInput = Readonly<{
  connectionString: string;
  nodeEnv: string | undefined;
  testMode: string | undefined;
}>;

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function databaseNameFromUrl(url: URL): string {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new Error("Test database URL must name exactly one database.");
  }

  return databaseName;
}

export function assertSafeTestDatabase(input: TestDatabaseGuardInput): URL {
  if (input.nodeEnv !== "test") {
    throw new Error("Refusing test database access outside NODE_ENV=test.");
  }

  if (input.testMode !== "true") {
    throw new Error("Refusing test database access without V2_DB_TEST_MODE=true.");
  }

  const url = new URL(input.connectionString);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Test database URL must use the PostgreSQL protocol.");
  }

  if (!loopbackHosts.has(url.hostname)) {
    throw new Error("Refusing test database access on a non-loopback host.");
  }

  if (!databaseNameFromUrl(url).startsWith("klol_v2_test_")) {
    throw new Error("Refusing database without the klol_v2_test_ prefix.");
  }

  return url;
}
