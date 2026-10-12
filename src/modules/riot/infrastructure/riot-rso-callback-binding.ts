import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import type { AuthRepository } from "@/modules/auth/application/ports/auth-repository";
import { authorizeSession } from "@/modules/auth/application/authorize-session";

export const RSO_CALLBACK_COOKIE = "klol_rso_callback";
export const RSO_CALLBACK_MAX_AGE_SECONDS = 10 * 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const digest = (state: string) => createHash("sha256").update(state).digest("hex");
const signature = (value: string, secret: string) => createHmac("sha256", secret).update(`klol:rso-callback:v1\0${value}`).digest();

export function rsoCallbackCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/me/riot/rso/callback", maxAge: RSO_CALLBACK_MAX_AGE_SECONDS };
}

export function createRsoCallbackBinding(input: { session: AuthSession; tokenHash: Uint8Array; state: string; secret: string; now?: number }) {
  const now = input.now ?? Date.now();
  if (input.secret.length < 32 || !authorizeSession(input.session, "USER").allowed || input.session.source !== "database" || input.tokenHash.byteLength !== 32 || !input.state || input.state.length > 1_000) throw new Error("INVALID_RSO_CALLBACK_BINDING");
  const payload = Buffer.from(JSON.stringify({
    sessionId: input.session.sessionId, userId: input.session.userId, tokenHash: Buffer.from(input.tokenHash).toString("hex"),
    stateHash: digest(input.state), expiresAt: Math.min(now + RSO_CALLBACK_MAX_AGE_SECONDS * 1_000, input.session.expiresAt),
  })).toString("base64url");
  return `${payload}.${signature(payload, input.secret).toString("base64url")}`;
}

/** This capability is valid only for the exact RSO state and original live ACCOUNT session. */
export async function resolveRsoCallbackSession(input: { binding: string | undefined; state: string; secret: string | undefined; repository: Pick<AuthRepository, "findActiveSession">; now?: number }): Promise<AuthSession | null> {
  const now = input.now ?? Date.now();
  if (!input.binding || input.binding.length > 2_048 || !input.secret || input.secret.length < 32 || !input.state || input.state.length > 1_000) return null;
  try {
    const parts = input.binding.split(".");
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
    const [payload, supplied] = parts;
    const actual = Buffer.from(supplied, "base64url");
    const expected = signature(payload, input.secret);
    if (actual.toString("base64url") !== supplied || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || !uuid.test(value.sessionId) || !uuid.test(value.userId) || !/^[0-9a-f]{64}$/.test(value.tokenHash) ||
      value.stateHash !== digest(input.state) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + RSO_CALLBACK_MAX_AGE_SECONDS * 1_000) return null;
    const principal = await input.repository.findActiveSession(value.sessionId, Buffer.from(value.tokenHash, "hex"), new Date(now));
    if (!principal || principal.userAccountId !== value.userId || principal.sessionId !== value.sessionId || principal.expiresAt.getTime() < value.expiresAt) return null;
    const session: AuthSession = {
      sessionId: principal.sessionId, userId: principal.userAccountId, role: principal.role, purpose: principal.purpose,
      accountStatus: principal.accountStatus, mustChangePassword: principal.mustChangePassword, authVersion: principal.authVersion,
      adminTotpVerified: principal.totpVerifiedAt !== null, source: "database", issuedAt: principal.issuedAt.getTime(), expiresAt: principal.expiresAt.getTime(),
    };
    return authorizeSession(session, "USER").allowed && session.expiresAt > now ? session : null;
  } catch { return null; }
}
