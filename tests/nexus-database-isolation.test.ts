import assert from "node:assert/strict";
import test from "node:test";
import { configuredRuntimeDatabaseUrl, requireRuntimeDatabaseUrl } from "../src/platform/db/runtime-database-url";
import { JoseSessionCodec } from "../src/modules/auth/infrastructure/jose-session-codec";
import { nexusBootstrapTarget } from "../scripts/nexus/empty-database";

test("NEXUS never falls back to the existing service's database", () => {
  const legacy = "postgresql://klol@example.invalid/klol";
  assert.equal(configuredRuntimeDatabaseUrl({ DATABASE_URL: legacy }), legacy);
  assert.equal(configuredRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "nexus", DATABASE_URL: legacy }), undefined);
  assert.throws(() => requireRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "nexus", DATABASE_URL: legacy }), /NEXUS_DATABASE_URL is not configured/);
  const nexus = "postgresql://nexus@example.invalid/nexus";
  assert.equal(requireRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "nexus", DATABASE_URL: legacy, NEXUS_DATABASE_URL: nexus }), nexus);
});

test("NEXUS rejects the same physical database even with different credentials and query strings", () => {
  assert.throws(() => requireRuntimeDatabaseUrl({
    NEXT_PUBLIC_SERVICE_ID: "nexus",
    DATABASE_URL: "postgresql://old:old@localhost/shared?sslmode=disable",
    NEXUS_DATABASE_URL: "postgres://new:new@127.0.0.1:5432/shared",
  }), /different database/);
  assert.throws(() => requireRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "nexus", NEXUS_DATABASE_URL: "https://example.invalid/nexus" }), /PostgreSQL protocol/);
  assert.throws(() => requireRuntimeDatabaseUrl({
    NEXT_PUBLIC_SERVICE_ID: "nexus",
    DATABASE_URL: "postgresql://old@ep-example.c-2.us-east-2.aws.neon.tech/neondb",
    NEXUS_DATABASE_URL: "postgresql://new@ep-example-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require",
  }), /different database/);
  assert.throws(() => configuredRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "typo", DATABASE_URL: "postgres://localhost/klol" }), /must be klol, nexus, or hub/);
});

test("fresh bootstrap requires the explicit service, database identity, and creation intent", () => {
  const environment = { NEXT_PUBLIC_SERVICE_ID: "nexus", NEXUS_DATABASE_URL: "postgres://localhost/nexus_test", NEXUS_DATABASE_NAME: "nexus_test", NEXUS_BOOTSTRAP_CONFIRM: "CREATE_EMPTY_NEXUS" };
  assert.equal(nexusBootstrapTarget(environment).databaseName, "nexus_test");
  assert.throws(() => nexusBootstrapTarget({ ...environment, NEXT_PUBLIC_SERVICE_ID: "klol" }), /requires NEXT_PUBLIC_SERVICE_ID=nexus/);
  assert.throws(() => nexusBootstrapTarget({ ...environment, NEXUS_BOOTSTRAP_CONFIRM: "" }), /CREATE_EMPTY_NEXUS/);
  assert.throws(() => nexusBootstrapTarget({ ...environment, NEXUS_DATABASE_NAME: "other" }), /exactly identify/);
  assert.throws(() => nexusBootstrapTarget({ ...environment, NEXUS_DATABASE_NAME: "postgres", NEXUS_DATABASE_URL: "postgres://localhost/postgres" }), /dedicated/);
});

test("service-bound sessions reject the other service even if a signing key is accidentally reused", async () => {
  const key = "synthetic-isolation-test-secret-32-bytes-or-more";
  const klol = new JoseSessionCodec(key, "klol");
  const nexus = new JoseSessionCodec(key, "nexus");
  const seed = { userId: "synthetic-admin", role: "ADMIN" as const, purpose: "ADMIN" as const, accountStatus: "APPROVED" as const, mustChangePassword: false, authVersion: 0, adminTotpVerified: true, source: "database" as const };
  const klolToken = await klol.encode(seed);
  const nexusToken = await nexus.encode(seed);
  assert.ok(await klol.decode(klolToken));
  assert.ok(await nexus.decode(nexusToken));
  assert.equal(await nexus.decode(klolToken), null);
  assert.equal(await klol.decode(nexusToken), null);
});
