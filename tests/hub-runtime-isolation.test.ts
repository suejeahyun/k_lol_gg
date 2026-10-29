import assert from "node:assert/strict";
import test from "node:test";
import { getServiceBrand, getServiceOrigin, type ServiceId } from "../src/lib/service-brand";
import { resolveHubRoute } from "../src/lib/hub-route-policy";
import { configuredRuntimeDatabaseUrl, requireRuntimeDatabaseUrl } from "../src/platform/db/runtime-database-url";
import { JoseSessionCodec } from "../src/modules/auth/infrastructure/jose-session-codec";

test("hub has its own identity and cannot select either community database as a fallback", () => {
  const environment = { NEXT_PUBLIC_SERVICE_ID: "hub", DATABASE_URL: "postgres://klol@localhost/klol", NEXUS_DATABASE_URL: "postgres://nexus@localhost/nexus" };
  assert.equal(getServiceBrand("hub").name, "GG HUB");
  assert.equal(getServiceBrand("hub").storagePrefix, "gg-hub");
  assert.equal(getServiceOrigin("", getServiceBrand("hub")).origin, "http://localhost:3000");
  assert.equal(configuredRuntimeDatabaseUrl(environment), undefined);
  assert.throws(() => requireRuntimeDatabaseUrl(environment), /HUB_DATABASE_URL is not configured/);
  assert.equal(requireRuntimeDatabaseUrl({ ...environment, HUB_DATABASE_URL: "postgres://hub@localhost/hub" }), "postgres://hub@localhost/hub");
});

test("hub rejects either shared database through pooler, credentials or loopback aliases", () => {
  for (const childName of ["DATABASE_URL", "NEXUS_DATABASE_URL"] as const) {
    for (const [child, hub] of [
      ["postgres://old:old@localhost/shared", "postgresql://new:new@127.0.0.1:5432/shared?sslmode=disable"],
      ["postgres://old@ep-example.c-2.ap-southeast-1.aws.neon.tech/neondb", "postgres://new@ep-example-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"],
    ]) {
      assert.throws(() => requireRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "hub", [childName]: child, HUB_DATABASE_URL: hub }), new RegExp(`different database from ${childName}`));
    }
  }
  assert.throws(() => requireRuntimeDatabaseUrl({ NEXT_PUBLIC_SERVICE_ID: "hub", HUB_DATABASE_URL: "https://example.invalid/hub" }), /PostgreSQL protocol/);
});

test("all three services reject each other's sessions even when the signing key is the same", async () => {
  const services: ServiceId[] = ["klol", "nexus", "hub"];
  const codecs = services.map((service) => new JoseSessionCodec("synthetic-isolation-secret-at-least-32-bytes", service));
  const seed = { userId: "synthetic-hub-admin", role: "SUPER_ADMIN" as const, purpose: "ADMIN" as const, accountStatus: "APPROVED" as const, mustChangePassword: false, authVersion: 0, adminTotpVerified: false, source: "database" as const };
  for (const [issuer, codec] of codecs.entries()) {
    const token = await codec.encode(seed);
    for (const [receiver, verifier] of codecs.entries()) assert.equal(Boolean(await verifier.decode(token)), issuer === receiver, `${services[issuer]} -> ${services[receiver]}`);
  }
});

test("hub allows only its navigation, required auth operations, registry and read-only assets", () => {
  for (const path of ["/", "/community-network", "/admin/community-network", "/admin/login", "/admin/security", "/login", "/signup", "/forgot-password", "/terms", "/privacy", "/help/contact", "/sites", "/sites/new", "/admin/community-sites", "/admin/users", "/api/admin/users", "/api/cron/community-sites", "/sso/authorize", "/account/password", "/forbidden", "/api/auth/me", "/api/health", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/_next/static/chunks/app.js", "/icons/hub/mark.svg", "/images/hub/social.svg"]) {
    assert.equal(resolveHubRoute(path, "GET").kind, "allow", path);
    assert.equal(resolveHubRoute(path, "HEAD").kind, "allow", path);
    assert.equal(resolveHubRoute(path, "POST").kind, "method-not-allowed", path);
  }
  for (const path of ["/api/admin/login", "/api/admin/logout", "/api/auth/login", "/api/auth/logout", "/api/auth/signup", "/api/auth/reset-requests", "/api/support", "/api/auth/community-sso/authorize", "/api/auth/community-sso/exchange"]) {
    assert.equal(resolveHubRoute(path, "POST").kind, "allow", path);
    assert.equal(resolveHubRoute(path, "GET").kind, "method-not-allowed", path);
  }
  assert.equal(resolveHubRoute("/api/admin/community-network", "PUT").kind, "allow");
  assert.equal(resolveHubRoute("/api/admin/community-network", "DELETE").kind, "method-not-allowed");
  assert.equal(resolveHubRoute("/api/auth/password", "PATCH").kind, "allow");
  assert.deepEqual(resolveHubRoute("/admin", "GET"), { kind: "redirect", destination: "/admin/community-network" });
  assert.deepEqual(resolveHubRoute("/account", "GET"), { kind: "redirect", destination: "/" });
});

test("hub denies child routes, unregistered APIs and encoded/static-prefix escapes", () => {
  for (const path of ["/players", "/rankings/mmr", "/recruits", "/competitions", "/account/profile", "/api/auth/me/player", "/api/admin/site-settings", "/api/admin/security/totp", "/api/admin/security/totp/setup", "/api/kakao/v4/webhook", "/api/cron/security-maintenance", "/api/future-route", "/api/admin/community-network/extra", "/app/login", "/icons/klol-mark.svg", "/images/nexus/mascot-board.png", "/icons/hub/../klol.svg", "/icons/hub/%2e%2e/klol.svg", "/%61dmin/community-network", "//admin/community-network", "/admin\\community-network", "/_next/data/build/admin/users.json", "/_next/image", "/_next/webpack-hmr"]) {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) assert.equal(resolveHubRoute(path, method).kind, "not-found", `${method} ${path}`);
  }
  assert.equal(resolveHubRoute("/_next/webpack-hmr", "GET", true).kind, "allow");
});

test("hub allows exact site and recovery actions without opening arbitrary administrator routes", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  for (const path of [`/sites/${id}`, `/admin/community-sites/${id}`, `/admin/users/${id}`]) assert.equal(resolveHubRoute(path, "GET").kind, "allow");
  for (const path of [`/api/community-sites/${id}`, `/api/admin/community-sites/${id}`, `/api/admin/users/${id}/password-reset`]) assert.equal(resolveHubRoute(path, "PATCH").kind, "allow");
  for (const path of ["/sites/not-an-id", `/api/community-sites/${id}/unknown`, `/api/admin/users/${id}/unknown`, `/api/auth/community-sso/callback`]) assert.equal(resolveHubRoute(path, "GET").kind, "not-found");
});

test("hub introduction detail is read-only and never exposes a child introduction editor or API", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  for (const method of ["GET", "HEAD"]) assert.equal(resolveHubRoute(`/community-network/${id}`, method).kind, "allow");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(resolveHubRoute(`/community-network/${id}`, method).kind, "method-not-allowed");
  for (const path of ["/community-network/not-an-id", `/community-network/${id}/edit`, "/admin/community-introduction", "/api/admin/community-introduction", "/api/community-introduction"]) {
    assert.equal(resolveHubRoute(path, "GET").kind, "not-found", path);
  }
});
