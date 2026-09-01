import "server-only";

import { createHmac } from "node:crypto";

import type { RecordLoginAttemptInput } from "@/modules/auth/application/ports/auth-repository";
import type { LoginRateLimitScope } from "@/modules/auth/domain/auth-records";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { resolveRateLimitClientKey } from "@/modules/auth/infrastructure/rate-limit-client-key";
import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";

type Action = "UPSERT" | "CANCEL";
type Decision =
  | { available: false }
  | { available: true; allowed: true }
  | { available: true; allowed: false; retryAfterSeconds: number };
type Rule = Readonly<{ scope: LoginRateLimitScope; domain: string; value: string; limit: number }>;

const WINDOW_MS = 10 * 60_000;

function input(rule: Rule, pepper: Buffer, nowMs: number): RecordLoginAttemptInput {
  const windowStartedMs = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
  const resetAtMs = windowStartedMs + WINDOW_MS;
  return {
    scope: rule.scope,
    keyHash: createHmac("sha256", pepper)
      .update(rule.domain, "utf8")
      .update("\0", "utf8")
      .update(rule.value.slice(0, 256), "utf8")
      .digest(),
    windowStartedAt: new Date(windowStartedMs),
    now: new Date(nowMs),
    expiresAt: new Date(resetAtMs + WINDOW_MS),
    blockUntil: new Date(resetAtMs),
    limit: rule.limit,
  };
}

export async function guardSeasonApplicationMutation(
  request: Request,
  session: AuthSession,
  action: Action,
): Promise<Decision> {
  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database" || session.source !== "database") return { available: false };
  const actionDomain = action.toLocaleLowerCase("en-US");
  const rules: Rule[] = [
    { scope: "GLOBAL_HASH", domain: `klol-v2:rate-limit:season:${actionDomain}:global:v1`, value: "all", limit: 240 },
    { scope: "IP_HASH", domain: `klol-v2:rate-limit:season:${actionDomain}:ip:v1`, value: resolveRateLimitClientKey(request.headers), limit: 12 },
    { scope: "LOGIN_ID_HASH", domain: `klol-v2:rate-limit:season:${actionDomain}:account:v1`, value: session.userId, limit: 12 },
    { scope: "LOGIN_ID_HASH", domain: `klol-v2:rate-limit:season:${actionDomain}:session:v1`, value: `${session.userId}:${session.sessionId}`, limit: 12 },
  ];
  const nowMs = Date.now();
  try {
    const records = await Promise.all(rules.map((rule) => context.repository.recordLoginAttempt(input(rule, context.rateLimitPepper, nowMs))));
    const waitMs = records.reduce((maximum, record) => Math.max(maximum, (record.blockedUntil?.getTime() ?? 0) - nowMs), 0);
    return waitMs > 0
      ? { available: true, allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1_000)) }
      : { available: true, allowed: true };
  } catch {
    return { available: false };
  }
}
