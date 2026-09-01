import "server-only";

import { randomUUID } from "node:crypto";

import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import {
  formatRevisionEtag,
  idempotencyHashMaterial,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemResponse,
  readIdempotencyKey,
  readValidatedTraceId,
} from "@/platform/http";

import { PLAYER_HTTP_PROBLEMS } from "../application/player-http-problems";
import type { PlayerMutationCommand, PlayerMutationOutcome } from "../domain/admin-player";

export async function authorizeAdminPlayerApi(request: Request): Promise<
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
        ? PLAYER_HTTP_PROBLEMS.unauthorized
        : PLAYER_HTTP_PROBLEMS.forbidden,
      { traceId },
    ),
  };
}

export function guardAdminMutationOrigin(request: Request, traceId?: string): Response | null {
  const publicOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  return hasSameOrigin(request, publicOrigin)
    ? null
    : problemResponse(PLAYER_HTTP_PROBLEMS.originForbidden, { traceId });
}

export function buildPlayerMutationCommand(input: {
  request: Request;
  session: AuthSession;
  scope: string;
  requestFingerprint: string;
  now?: Date;
}):
  | Readonly<{ ok: true; command: PlayerMutationCommand }>
  | Readonly<{ ok: false; response: Response }> {
  const traceId = readValidatedTraceId(input.request.headers);
  const idempotency = readIdempotencyKey(input.request.headers);
  if (!idempotency.ok) {
    return {
      ok: false,
      response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }),
    };
  }

  return {
    ok: true,
    command: {
      actorUserAccountId: input.session.userId,
      requestId: randomUUID(),
      idempotencyKeyMaterial: idempotencyHashMaterial(idempotency.key, input.scope),
      requestFingerprint: input.requestFingerprint,
      now: input.now ?? new Date(),
    },
  };
}

export function playerMutationResponse(
  outcome: PlayerMutationOutcome,
  traceId?: string,
): Response {
  if (outcome.type === "success") {
    return noStoreJsonResponse(outcome.response, {
      status: outcome.status,
      traceId,
      headers: {
        ETag: formatRevisionEtag(outcome.revision),
        ...(outcome.replayed ? { "Idempotency-Replayed": "true" } : {}),
      },
    });
  }
  if (outcome.type === "not-found") {
    return problemResponse(PLAYER_HTTP_PROBLEMS.notFound, { traceId });
  }
  if (outcome.type === "precondition-failed") {
    return problemResponse(PLAYER_HTTP_PROBLEMS.revisionMismatch, {
      traceId,
      headers: { ETag: formatRevisionEtag(outcome.currentRevision) },
    });
  }

  const problem = {
    DUPLICATE_LEGACY_ID: PLAYER_HTTP_PROBLEMS.conflictLegacyId,
    DUPLICATE_RIOT_ID: PLAYER_HTTP_PROBLEMS.conflictRiotId,
    IDEMPOTENCY_KEY_REUSED: PLAYER_HTTP_PROBLEMS.idempotencyConflict,
  }[outcome.reason];
  return problemResponse(problem, { traceId });
}
