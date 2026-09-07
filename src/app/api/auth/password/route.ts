import { NextRequest, NextResponse } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import {
  accountMutationScope,
  fingerprintAccountMutation,
  parsePasswordChangeInput,
} from "@/modules/accounts/domain/account-contracts";
import {
  accountMutationResponse,
  authorizeAccountApi,
  buildAccountMutationCommand,
  guardAccountMutationOrigin,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import {
  acquireAccountCredentialWork,
  guardAccountOperationAttempt,
} from "@/modules/auth/infrastructure/login-security-guard";
import { hashPassword } from "@/modules/auth/infrastructure/node-password";
import {
  clearedSessionCookieOptions,
  sessionCookieName,
} from "@/modules/auth/infrastructure/runtime-session";
import {
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIfMatchRevision,
  readJsonBody,
} from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const authorization = await authorizeAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, authorization.traceId);
  if (originFailure) return originFailure;
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) {
    return problemResponse(problemForIfMatchRevisionError(revision.error), {
      traceId: authorization.traceId,
    });
  }
  const body = await readJsonBody(request, { maximumBytes: 4 * 1024 });
  if (!body.ok) {
    return problemResponse(problemForJsonBodyError(body.error), { traceId: authorization.traceId });
  }
  const input = parsePasswordChangeInput(body.value);
  if (!input.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId: authorization.traceId });
  const rateLimit = await guardAccountOperationAttempt(
    request,
    "password-change",
    authorization.session.userId,
  );
  if (!rateLimit.available) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
  if (!rateLimit.allowed) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId: authorization.traceId,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }
  const scope = accountMutationScope("password-change", authorization.session.userId);
  const command = buildAccountMutationCommand({
    request,
    session: authorization.session,
    scope,
    principalKey: `account:${authorization.session.userId}`,
    requestFingerprint: fingerprintAccountMutation({
      action: "password-change",
      currentPassword: input.value.currentPassword,
      newPassword: input.value.newPassword,
      revision: revision.revision,
    }),
  });
  if (!command.ok) return command.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  const releaseWork = acquireAccountCredentialWork();
  if (!releaseWork) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId: authorization.traceId,
      headers: { "Retry-After": "1" },
    });
  }
  try {
    const nextHash = await hashPassword(input.value.newPassword);
    const response = accountMutationResponse(
      await repository.changeOwnPassword(
        input.value,
        nextHash,
        revision.revision,
        command.command,
      ),
      authorization.traceId,
    );
    if (response.ok) {
      const nextResponse = new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
      for (const purpose of ["ACCOUNT", "ADMIN"] as const) {
        nextResponse.cookies.set(
          sessionCookieName(purpose),
          "",
          clearedSessionCookieOptions(
            request.nextUrl.protocol === "https:",
            process.env.NODE_ENV,
            purpose,
          ),
        );
      }
      return nextResponse;
    }
    return response;
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  } finally {
    releaseWork();
  }
}
