import assert from "node:assert/strict";
import test from "node:test";
import { isPublicCommunityPreviewRequest, mayAccessCommunityPreview } from "../src/modules/community-sites/domain/publication-access";
import type { AuthSession } from "../src/modules/auth/domain/auth-session";

test("unpublished child permits only the authentication backbone, health and immutable assets", () => {
  for (const path of ["/login", "/terms", "/icons/hub/mark.svg", "/api/health", "/api/community-runtime", "/api/auth/community-sso/start", "/api/auth/community-sso/callback", "/_next/static/chunks/main.js"]) {
    assert.equal(isPublicCommunityPreviewRequest(path, "GET"), true, path);
    assert.equal(isPublicCommunityPreviewRequest(path, "POST"), false, path);
  }
  for (const path of ["/", "/signup", "/api/auth/signup", "/api/auth/community-profile", "/api/recruiting", "/players", "/admin", "/_next/image", "/uploads/private.png", "/api/%61uth/me"]) {
    assert.equal(isPublicCommunityPreviewRequest(path, "GET"), false, path);
    assert.equal(isPublicCommunityPreviewRequest(path, "POST"), false, path);
  }
  assert.equal(isPublicCommunityPreviewRequest("/api/auth/login", "POST"), true);
  assert.equal(isPublicCommunityPreviewRequest("/_next/webpack-hmr", "GET"), false);
  assert.equal(isPublicCommunityPreviewRequest("/_next/webpack-hmr", "GET", true), true);
});

test("preview membership requires the exact owner and a current approved durable administrator session", () => {
  const owner = "owner-id";
  const session: AuthSession = { sessionId: "s", userId: owner, role: "SUPER_ADMIN", accountStatus: "APPROVED", purpose: "ACCOUNT", source: "database", mustChangePassword: false, authVersion: 1, adminTotpVerified: false, issuedAt: Date.now(), expiresAt: Date.now() + 60000 };
  assert.equal(mayAccessCommunityPreview(owner, session), true);
  assert.equal(mayAccessCommunityPreview(owner, { ...session, purpose: "ADMIN" }), true);
  assert.equal(mayAccessCommunityPreview(owner, null), false);
  assert.equal(mayAccessCommunityPreview(owner, { ...session, userId: "someone-else" }), false);
  assert.equal(mayAccessCommunityPreview(owner, { ...session, role: "USER" }), false);
  assert.equal(mayAccessCommunityPreview(owner, { ...session, accountStatus: "PENDING" }), false);
  assert.equal(mayAccessCommunityPreview(owner, { ...session, accountStatus: "SUSPENDED" }), false);
  assert.equal(mayAccessCommunityPreview(owner, { ...session, source: "fixture" }), false);
});
