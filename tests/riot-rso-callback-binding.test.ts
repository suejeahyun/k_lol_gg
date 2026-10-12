import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createRsoCallbackBinding, resolveRsoCallbackSession, rsoCallbackCookieOptions } from "../src/modules/riot/infrastructure/riot-rso-callback-binding";
import { sessionCookieOptions } from "../src/modules/auth/infrastructure/session-cookie-policy";
import type { AuthSession } from "../src/modules/auth/domain/auth-session";
import { rsoCompletionResponse } from "../src/modules/riot/infrastructure/riot-rso-completion";

test("cross-site callback capability is limited to one state and the originating live session", async () => {
  const now = Date.now(), secret = randomBytes(32).toString("hex"), tokenHash = randomBytes(32), state = randomUUID();
  const session: AuthSession = { sessionId: randomUUID(), userId: randomUUID(), role: "USER", purpose: "ACCOUNT", accountStatus: "APPROVED", mustChangePassword: false, authVersion: 3, adminTotpVerified: false, source: "database", issuedAt: now - 1_000, expiresAt: now + 3_600_000 };
  let revoked = false, wrongAccount = false, wrongSession = false;
  const repository = { async findActiveSession(id: string, hash: Uint8Array) {
    assert.equal(id, session.sessionId); assert.deepEqual(Buffer.from(hash), tokenHash);
    if (revoked) return null;
    return { sessionId: wrongSession ? randomUUID() : id, userAccountId: wrongAccount ? randomUUID() : session.userId, role: session.role, purpose: session.purpose, accountStatus: session.accountStatus, mustChangePassword: false, authVersion: 3, totpVerifiedAt: null, issuedAt: new Date(session.issuedAt), expiresAt: new Date(session.expiresAt) };
  } };
  const binding = createRsoCallbackBinding({ session, tokenHash, state, secret, now });
  const input = { binding, state, secret, repository, now };
  assert.equal((await resolveRsoCallbackSession(input))?.sessionId, session.sessionId);
  assert.equal(await resolveRsoCallbackSession({ ...input, state: randomUUID() }), null);
  assert.equal(await resolveRsoCallbackSession({ ...input, binding: `${binding}x` }), null);
  assert.equal(await resolveRsoCallbackSession({ ...input, secret: randomBytes(32).toString("hex") }), null);
  assert.equal(await resolveRsoCallbackSession({ ...input, now: now + 600_000 }), null);
  wrongAccount = true; assert.equal(await resolveRsoCallbackSession(input), null); wrongAccount = false;
  wrongSession = true; assert.equal(await resolveRsoCallbackSession(input), null); wrongSession = false;
  revoked = true; assert.equal(await resolveRsoCallbackSession(input), null);
  assert.equal(await resolveRsoCallbackSession({ ...input, binding: undefined }), null);
  assert.deepEqual(rsoCallbackCookieOptions(true), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/me/riot/rso/callback", maxAge: 600 });
  assert.equal(sessionCookieOptions(true, "production", "ACCOUNT").sameSite, "strict");
  assert.equal(sessionCookieOptions(true, "production", "ADMIN").sameSite, "strict");
});

test("RSO completion commits a private same-site document without reflecting callback credentials", async () => {
  const response = rsoCompletionResponse("connected");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const html = await response.text();
  assert.match(html, /http-equiv="refresh" content="0;url=\/account\/riot\?rso=connected"/);
  assert.match(html, /<a href="\/account\/riot\?rso=connected">/);
  assert.doesNotMatch(html, /<script|authorization_code|token|state=/);
});
