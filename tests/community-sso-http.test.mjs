import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

const siteId = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(43), state = "b".repeat(43);
const ssoRequest = { siteId, callbackUrl: "https://child.example/api/auth/community-sso/callback", codeChallenge: token, state, purpose: "ACCOUNT" };

function harness(name, options = {}) {
  const calls = [];
  const seed = { userId: "local-member", role: "USER", purpose: "ACCOUNT", accountStatus: "PENDING", authVersion: 0, mustChangePassword: false, adminTotpVerified: false, source: "database" };
  const actor = { userId: "hub-member", role: "USER", sessionId: "current-session", authVersion: 7 };
  const modules = {
    "next/server": { NextRequest, NextResponse },
    "@/lib/service-brand": { SERVICE_BRAND: { id: options.service ?? (name === "callback" ? "community" : "hub") } },
    "@/modules/accounts/domain/account-policies": { COMMUNITY_ACCOUNT_TERMS_VERSION: "test-terms", COMMUNITY_ACCOUNT_PRIVACY_VERSION: "test-privacy" },
    "@/modules/accounts/infrastructure/account-http": { guardAccountMutationOrigin: (request) => request.headers.get("origin") === "https://hub.example" ? null : new Response(null, { status: 403 }) },
    "@/modules/accounts/infrastructure/runtime-account-data": { getRuntimeAccountRepository: () => ({ authenticateUser: async ({ password }) => {
      calls.push("password-verify"); return password === "correct-synthetic-password" ? { type: "authenticated", session: { userId: actor.userId, authVersion: actor.authVersion } } : { type: "invalid-credentials" };
    } }) },
    "@/modules/auth/domain/community-sso": { SSO_TOKEN_PATTERN: /^[A-Za-z0-9_-]{43}$/u, COMMUNITY_SSO_CALLBACK_PATH: "/api/auth/community-sso/callback", parseCommunitySsoRequest: (request) => {
      if (Object.keys(request).sort().join(",") !== "callbackUrl,codeChallenge,purpose,siteId,state") return null;
      return request.siteId === siteId && ["ACCOUNT", "ADMIN"].includes(request.purpose) ? request : null;
    } },
    "@/modules/auth/domain/transaction-session": { transactionSessionActor: (session) => ({ userAccountId: session.userId, sessionId: session.sessionId, role: session.role, authVersion: session.authVersion }) },
    "@/modules/auth/infrastructure/server-authorization": { authorizeApiRole: async () => options.anonymous ? { allowed: false } : { allowed: true, session: actor } },
    "@/modules/auth/infrastructure/login-security-guard": { guardAccountOperationAttempt: async () => ({ available: true, allowed: true }), acquireAccountCredentialWork: () => () => {} },
    "@/modules/auth/infrastructure/runtime-auth-context": { resolveRuntimeAuthContext: () => ({ mode: "database", repository: { findAccountById: async () => ({ loginId: "hub-member" }) } }) },
    "@/modules/auth/infrastructure/runtime-community-sso": {
      communitySsoRepository: () => ({ authorize: async (request, authorizedActor) => { calls.push({ request, authorizedActor }); return token; }, resolveLocalAccount: async (identity) => { calls.push(identity); if (options.localDenied) throw new Error("denied"); return { seed, needsProfile: true }; } }),
      managedCommunitySsoRuntime: () => ({ siteId, hubOrigin: "https://hub.example", childOrigin: "https://child.example", cookieName: "sso-flow", clientSecret: "c".repeat(43) }),
      ssoFlowCookieOptions: (secure, maxAge) => ({ httpOnly: true, sameSite: "lax", secure, path: "/api/auth/community-sso/callback", maxAge }),
    },
    "@/platform/http": { noStoreJsonResponse: (body, options = {}) => Response.json(body, { ...options, headers: { "Cache-Control": "no-store" } }), readJsonBody: async (request) => { try { return { ok: true, value: await request.json() }; } catch { return { ok: false }; } } },
    "@/modules/auth/application/normalize-internal-next": { normalizeAccountNext: () => "/recruits", normalizeInternalNext: () => "/admin" },
    "@/modules/auth/infrastructure/community-sso-crypto": { decodeCommunitySsoFlow: async () => options.invalidFlow ? null : ({ siteId, state, verifier: token, purpose: "ACCOUNT", nextPath: "/recruits" }) },
    "@/modules/auth/infrastructure/runtime-session": { issueRuntimeSession: async (value) => { calls.push({ issued: value }); return "synthetic-session"; }, sessionCookieName: () => "local-account", sessionCookieOptions: () => ({ httpOnly: true, secure: true, sameSite: "strict", path: "/" }) },
  };
  const filename = new URL(`../src/app/api/auth/community-sso/${name}/route.ts`, import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(source, { exports: output.exports, module: output, require: (key) => { assert.ok(modules[key], `Unexpected import ${key}`); return modules[key]; },
    Request, Response, Headers, URL, URLSearchParams, AbortSignal, process: { env: { NODE_ENV: "production" } }, fetch: async (_url, request) => {
      calls.push({ exchange: JSON.parse(request.body), authorization: request.headers.Authorization });
      return Response.json({ issuer: options.wrongIssuer ? "https://evil.example" : "https://hub.example", subject: "00000000-0000-4000-8000-000000000002", siteId, purpose: "ACCOUNT", termsVersion: "test-terms", privacyVersion: "test-privacy", role: "SUPER_ADMIN" });
    } }, { filename: filename.pathname });
  return { ...output.exports, calls };
}
function authorizeRequest(body, origin = "https://hub.example") { return new Request("https://hub.example/api/auth/community-sso/authorize", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }); }
function callbackRequest(query = `code=${token}&state=${state}`) { return new NextRequest(`https://child.example/api/auth/community-sso/callback?${query}`, { headers: { Cookie: "sso-flow=synthetic" } }); }

test("SSO authorization rejects missing login, foreign origin, missing consent and privilege injection", async () => {
  const body = { ...ssoRequest, termsAccepted: true, privacyAccepted: true };
  assert.equal((await harness("authorize", { anonymous: true }).POST(authorizeRequest(body))).status, 401);
  assert.equal((await harness("authorize").POST(authorizeRequest(body, "https://evil.example"))).status, 403);
  for (const invalid of [{ ...body, termsAccepted: false }, { ...body, privacyAccepted: false }, { ...body, role: "SUPER_ADMIN" }]) {
    const app = harness("authorize"); assert.equal((await app.POST(authorizeRequest(invalid))).status, 400); assert.equal(app.calls.length, 0);
  }
  assert.equal((await harness("authorize", { service: "nexus" }).POST(authorizeRequest(body))).status, 404);
});

test("administrator SSO requires fresh hub credentials while a hub USER remains an eligible child owner", async () => {
  const body = { ...ssoRequest, purpose: "ADMIN", termsAccepted: true, privacyAccepted: true };
  assert.equal((await harness("authorize").POST(authorizeRequest(body))).status, 400);
  assert.equal((await harness("authorize").POST(authorizeRequest({ ...body, password: "incorrect" }))).status, 401);
  const app = harness("authorize"); const response = await app.POST(authorizeRequest({ ...body, password: "correct-synthetic-password" }));
  assert.equal(response.status, 200); assert.equal(app.calls[0], "password-verify"); assert.equal(app.calls[1].authorizedActor.role, "USER");
  assert.equal(new URL((await response.json()).redirectTo).origin, "https://child.example");
});

test("callback rejects mismatched state and issuer, and issues only the child's returned authority", async () => {
  const stateMismatch = harness("callback"); assert.equal((await stateMismatch.GET(callbackRequest(`code=${token}&state=${"d".repeat(43)}`))).headers.get("location"), "https://child.example/login?sso=failed"); assert.equal(stateMismatch.calls.length, 0);
  const wrongIssuer = harness("callback", { wrongIssuer: true }); assert.match((await wrongIssuer.GET(callbackRequest())).headers.get("location"), /sso=failed/); assert.equal(wrongIssuer.calls.some((entry) => entry.issued), false);
  const denied = harness("callback", { localDenied: true }); assert.match((await denied.GET(callbackRequest())).headers.get("location"), /sso=failed/);
  const app = harness("callback"); const response = await app.GET(callbackRequest());
  assert.equal(response.status, 200); assert.equal(response.headers.get("location"), null);
  const completedDocument = await response.text(); assert.match(completedDocument, /\/account\/community-profile/); assert.match(completedDocument, /window\.location\.replace\(destination\)/); assert.doesNotMatch(completedDocument, /synthetic-session/);
  const issued = app.calls.find((entry) => entry.issued).issued; assert.equal(issued.role, "USER"); assert.equal(issued.accountStatus, "PENDING");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer"); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(response.headers.getSetCookie().some((cookie) => cookie.startsWith("sso-flow=") && /Max-Age=0/.test(cookie)));
});
