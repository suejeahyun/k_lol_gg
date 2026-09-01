import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { isAdminRole, type AuthSession, type AuthSessionSeed } from "../domain/auth-session";
import { sessionMatchesAccount } from "../application/validate-session-account";
import { getFixtureAuthAccountRepository } from "./fixture-auth-repository";
import { resolveRuntimeAuthContext } from "./runtime-auth-context";
import { hashSessionToken } from "./session-token-hash";

export const SESSION_COOKIE_NAME = "klol_v2_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 60;
const revokedFixtureSessions = new Map<string, number>();

function fixtureSessionIsRevoked(session: AuthSession): boolean {
  const revokedUntil = revokedFixtureSessions.get(session.sessionId);
  if (revokedUntil === undefined) return false;
  if (revokedUntil <= Date.now()) {
    revokedFixtureSessions.delete(session.sessionId);
    return false;
  }
  return true;
}

function revokeFixtureSession(session: AuthSession): void {
  const now = Date.now();
  revokedFixtureSessions.set(session.sessionId, session.expiresAt);
  if (revokedFixtureSessions.size <= 1_024) return;

  for (const [sessionId, expiresAt] of revokedFixtureSessions) {
    if (expiresAt <= now) revokedFixtureSessions.delete(sessionId);
  }
}

export async function issueRuntimeSession(seed: AuthSessionSeed) {
  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== seed.source) {
    throw new Error("Session runtime is not configured.");
  }

  const nowMs = Date.now();
  const issuedAt = new Date(Math.floor(nowMs / 1_000) * 1_000);
  const expiresAt = new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1_000);
  const sessionId = randomUUID();
  const token = await context.codec.encode(seed, {
    nowMs,
    sessionId,
    ttlSeconds: SESSION_MAX_AGE_SECONDS,
  });

  if (context.mode === "database") {
    const created = await context.repository.createSession({
      id: sessionId,
      tokenHash: hashSessionToken(token),
      userAccountId: seed.userId,
      authVersion: seed.authVersion,
      role: seed.role,
      totpVerifiedAt: seed.adminTotpVerified ? issuedAt : null,
      issuedAt,
      expiresAt,
    });
    if (!created) throw new Error("Session account state changed before issuance.");
  }

  return token;
}

async function validateRuntimeSessionToken(token: string): Promise<AuthSession | null> {
  const context = resolveRuntimeAuthContext();
  if (!context) return null;

  const session = await context.codec.decode(token);
  if (!session) return null;
  if (session.source !== context.mode) return null;

  if (context.mode === "fixture") {
    if (fixtureSessionIsRevoked(session)) return null;
    const accounts = await getFixtureAuthAccountRepository();
    const account = accounts ? await accounts.findById(session.userId) : null;
    return sessionMatchesAccount(session, account) ? session : null;
  }

  try {
    const principal = await context.repository.findActiveSession(
      session.sessionId,
      hashSessionToken(token),
      new Date(),
    );
    if (!principal) return null;

    const databaseTotpVerified = principal.totpVerifiedAt !== null;
    if (
      principal.sessionId !== session.sessionId ||
      principal.userAccountId !== session.userId ||
      principal.role !== session.role ||
      principal.authVersion !== session.authVersion ||
      databaseTotpVerified !== session.adminTotpVerified ||
      (!isAdminRole(session.role) && databaseTotpVerified) ||
      principal.issuedAt.getTime() !== session.issuedAt ||
      principal.expiresAt.getTime() !== session.expiresAt
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? validateRuntimeSessionToken(token) : null;
});

export type RuntimeSessionRevocationResult = "revoked" | "no-session" | "unavailable";

export async function revokeRuntimeSessionToken(
  token: string | undefined,
): Promise<RuntimeSessionRevocationResult> {
  if (!token) return "no-session";

  const context = resolveRuntimeAuthContext();
  if (!context) return "unavailable";

  const session = await context.codec.decode(token);
  if (!session || session.source !== context.mode) return "no-session";
  if (context.mode === "fixture") {
    revokeFixtureSession(session);
    return "revoked";
  }

  try {
    await context.repository.revokeSession(session.sessionId, new Date());
    return "revoked";
  } catch {
    return "unavailable";
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}

export function clearedSessionCookieOptions(secure: boolean) {
  return { ...sessionCookieOptions(secure), maxAge: 0 };
}
