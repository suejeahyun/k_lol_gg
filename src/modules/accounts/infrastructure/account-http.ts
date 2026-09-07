import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

import { authorizeAccountSession } from "@/modules/auth/application/authorize-session";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { readTextBodyWithinLimit } from "@/modules/auth/application/mutation-request-guard";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import {
  formatRevisionEtag,
  idempotencyHashMaterial,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemResponse,
  readIdempotencyKey,
  readValidatedTraceId,
} from "@/platform/http";
import { containsUnsafeText } from "@/platform/security/input-safety";

import {
  ACCOUNT_CONFLICT_PROBLEM_BY_REASON,
  ACCOUNT_HTTP_PROBLEMS,
} from "../application/account-http-problems";
import { protectAccountReceiptMaterial } from "../domain/account-receipt-protection";
import type { AccountMutationCommand, AccountMutationOutcome } from "../domain/account-contracts";

export async function authorizeAccountApi(request: Request): Promise<
  | Readonly<{ ok: true; session: AuthSession; traceId?: string }>
  | Readonly<{ ok: false; response: Response }>
> {
  const traceId = readValidatedTraceId(request.headers);
  const decision = authorizeAccountSession(await getCurrentSession("ACCOUNT"));
  if (decision.allowed) return { ok: true, session: decision.session, traceId };
  return {
    ok: false,
    response: problemResponse(
      decision.reason === "UNAUTHENTICATED"
        ? ACCOUNT_HTTP_PROBLEMS.unauthorized
        : ACCOUNT_HTTP_PROBLEMS.forbidden,
      { traceId },
    ),
  };
}

export async function authorizeAdminAccountApi(request: Request): Promise<
  | Readonly<{ ok: true; session: AuthSession; traceId?: string }>
  | Readonly<{ ok: false; response: Response }>
> {
  const traceId = readValidatedTraceId(request.headers);
  const decision = await authorizeApiRole("ADMIN");
  if (decision.allowed) return { ok: true, session: decision.session, traceId };
  return {
    ok: false,
    response: problemResponse(
      decision.reason === "UNAUTHENTICATED"
        ? ACCOUNT_HTTP_PROBLEMS.unauthorized
        : ACCOUNT_HTTP_PROBLEMS.forbidden,
      { traceId },
    ),
  };
}

export function guardAccountMutationOrigin(request: Request, traceId?: string): Response | null {
  const publicOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  return hasSameOrigin(request, publicOrigin)
    ? null
    : problemResponse(ACCOUNT_HTTP_PROBLEMS.originForbidden, { traceId });
}

export function guardExactAccountQuery(
  request: Request,
  allowedKeys: readonly string[] = [],
  traceId?: string,
): Response | null {
  const allowed = new Set(allowedKeys);
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    const values = params.getAll(key);
    if (
      !allowed.has(key) ||
      values.length !== 1 ||
      containsUnsafeText(values[0] ?? "")
    ) {
      return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidQuery, { traceId });
    }
  }
  return null;
}

export async function guardEmptyAccountBody(
  request: Request,
  traceId?: string,
): Promise<Response | null> {
  const body = await readTextBodyWithinLimit(request, 0);
  return body.ok && body.text.length === 0
    ? null
    : problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });
}

export function buildAccountMutationCommand(input: {
  request: Request;
  scope: string;
  principalKey: string;
  requestFingerprint: string;
  session?: AuthSession;
  now?: Date;
}):
  | Readonly<{ ok: true; command: AccountMutationCommand }>
  | Readonly<{ ok: false; response: Response }> {
  const traceId = readValidatedTraceId(input.request.headers);
  const idempotency = readIdempotencyKey(input.request.headers);
  if (!idempotency.ok) {
    return {
      ok: false,
      response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }),
    };
  }
  const runtimeContext = resolveRuntimeAuthContext();
  const receiptPepper = runtimeContext?.mode === "database"
    ? runtimeContext.rateLimitPepper
    : runtimeContext?.mode === "fixture" && process.env.V2_TEST_AUTH_SECRET
      ? createHash("sha256")
          .update("klol-v2:fixture-account-receipt:v1\0", "utf8")
          .update(process.env.V2_TEST_AUTH_SECRET, "utf8")
          .digest()
      : null;
  if (!receiptPepper) {
    return {
      ok: false,
      response: problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId }),
    };
  }
  const protectedMaterial = protectAccountReceiptMaterial(
    receiptPepper,
    input.scope,
    input.principalKey,
    input.requestFingerprint,
  );
  return {
    ok: true,
    command: {
      actorUserAccountId: input.session?.userId ?? null,
      actorSession: input.session ? transactionSessionActor(input.session) : undefined,
      principalKeyMaterial: protectedMaterial.principalKeyMaterial,
      idempotencyKeyMaterial: idempotencyHashMaterial(idempotency.key, input.scope),
      requestFingerprint: protectedMaterial.requestFingerprint,
      requestId: randomUUID(),
      now: input.now ?? new Date(),
    },
  };
}

export function accountMutationResponse(
  outcome: AccountMutationOutcome,
  traceId?: string,
): Response {
  if (outcome.type === "success") {
    const responseBody = outcome.oneTimeSecret
      ? { ...outcome.response, temporaryPassword: outcome.oneTimeSecret }
      : outcome.response;
    return noStoreJsonResponse(responseBody, {
      status: outcome.status,
      traceId,
      headers: {
        ...(outcome.revision === undefined ? {} : { ETag: formatRevisionEtag(outcome.revision) }),
        ...(outcome.replayed ? { "Idempotency-Replayed": "true" } : {}),
      },
    });
  }
  if (outcome.type === "not-found") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId });
  }
  if (outcome.type === "session-stale") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.sessionStale, { traceId });
  }
  if (outcome.type === "invalid-current-password") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidCurrentPassword, { traceId });
  }
  if (outcome.type === "precondition-failed") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.revisionMismatch, {
      traceId,
      headers: { ETag: formatRevisionEtag(outcome.currentRevision) },
    });
  }
  if (outcome.type === "forbidden") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.forbidden, { traceId });
  }
  return problemResponse(ACCOUNT_CONFLICT_PROBLEM_BY_REASON[outcome.reason], { traceId });
}

export function hashRecoveryLoginId(normalizedLoginId: string): Uint8Array | null {
  const context = resolveRuntimeAuthContext();
  if (!context || context.mode !== "database") return null;
  return createHmac("sha256", context.rateLimitPepper)
    .update("klol-v2:password-reset-login-id:v1\0", "utf8")
    .update(normalizedLoginId, "utf8")
    .digest();
}
