import "server-only";

import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { LoginAttemptLimiter, LoginWorkGate } from "../application/login-attempt-limiter";
import type { RecordLoginAttemptInput } from "../application/ports/auth-repository";
import type { LoginRateLimitScope } from "../domain/auth-records";
import type { AuthSession } from "../domain/auth-session";
import { resolveRateLimitClientKey } from "./rate-limit-client-key";
import { resolveRuntimeAuthContext } from "./runtime-auth-context";

function requestClientKey(request: NextRequest) {
  return resolveRateLimitClientKey(request.headers);
}

const limiter = new LoginAttemptLimiter();
const workGate = new LoginWorkGate();

export type RuntimeLoginRateLimitDecision =
  | { available: false }
  | { available: true; allowed: true }
  | { available: true; allowed: false; retryAfterSeconds: number };

type DurableRule = Readonly<{
  scope: LoginRateLimitScope;
  domain: string;
  value: string;
  limit: number;
  windowMs: number;
}>;

function hmacKey(pepper: Buffer, domain: string, value: string): Buffer {
  return createHmac("sha256", pepper)
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value.slice(0, 256), "utf8")
    .digest();
}

function durableInput(
  rule: DurableRule,
  pepper: Buffer,
  nowMs: number,
): RecordLoginAttemptInput {
  const windowStartedMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
  const resetAtMs = windowStartedMs + rule.windowMs;
  return {
    scope: rule.scope,
    keyHash: hmacKey(pepper, rule.domain, rule.value),
    windowStartedAt: new Date(windowStartedMs),
    now: new Date(nowMs),
    expiresAt: new Date(resetAtMs + rule.windowMs),
    blockUntil: new Date(resetAtMs),
    limit: rule.limit,
  };
}

async function guardDurableRules(
  context: Extract<NonNullable<ReturnType<typeof resolveRuntimeAuthContext>>, { mode: "database" }>,
  rules: readonly DurableRule[],
): Promise<RuntimeLoginRateLimitDecision> {
  const nowMs = Date.now();

  try {
    const records = await Promise.all(
      rules.map((rule) => context.repository.recordLoginAttempt(
        durableInput(rule, context.rateLimitPepper, nowMs),
      )),
    );
    const longestWait = records.reduce((wait, record) => {
      const blockedUntil = record.blockedUntil?.getTime() ?? 0;
      return Math.max(wait, blockedUntil - nowMs);
    }, 0);
    return longestWait > 0
      ? {
          available: true,
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(longestWait / 1_000)),
        }
      : { available: true, allowed: true };
  } catch {
    return { available: false };
  }
}

export async function guardAdminLoginAttempt(
  request: NextRequest,
  loginId: string,
): Promise<RuntimeLoginRateLimitDecision> {
  const context = resolveRuntimeAuthContext();
  if (!context) return { available: false };

  if (context.mode === "fixture") {
    const decision = limiter.consume(requestClientKey(request), loginId);
    return decision.allowed
      ? { available: true, allowed: true }
      : { available: true, allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
  }

  const clientKey = requestClientKey(request);
  const normalizedLogin = loginId.trim().normalize("NFKC").toLocaleLowerCase("ko-KR") || "<blank>";
  const rules: DurableRule[] = [
    {
      scope: "GLOBAL_HASH",
      domain: "klol-v2:rate-limit:global:v1",
      value: "admin-login",
      limit: 80,
      windowMs: 60_000,
    },
    {
      scope: "IP_HASH",
      domain: "klol-v2:rate-limit:ip:v1",
      value: clientKey,
      limit: 20,
      windowMs: 5 * 60_000,
    },
    {
      scope: "LOGIN_ID_HASH",
      domain: "klol-v2:rate-limit:login-id:v1",
      value: normalizedLogin,
      limit: 8,
      windowMs: 5 * 60_000,
    },
  ];
  return guardDurableRules(context, rules);
}

export async function guardAdminTotpCodeAttempt(
  request: NextRequest,
  session: AuthSession,
): Promise<RuntimeLoginRateLimitDecision> {
  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database" || session.source !== "database") {
    return { available: false };
  }

  const rules: DurableRule[] = [
    {
      scope: "GLOBAL_HASH",
      domain: "klol-v2:rate-limit:admin-totp-global:v1",
      value: "admin-totp-code",
      limit: 120,
      windowMs: 60_000,
    },
    {
      scope: "IP_HASH",
      domain: "klol-v2:rate-limit:admin-totp-ip:v1",
      value: requestClientKey(request),
      limit: 24,
      windowMs: 5 * 60_000,
    },
    {
      scope: "LOGIN_ID_HASH",
      domain: "klol-v2:rate-limit:admin-totp-session:v1",
      value: `${session.userId}:${session.sessionId}`,
      limit: 8,
      windowMs: 5 * 60_000,
    },
  ];
  return guardDurableRules(context, rules);
}

export function acquireAdminLoginWork() {
  return workGate.acquire();
}
