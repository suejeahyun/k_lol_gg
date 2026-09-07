import "server-only";

import { randomBytes } from "node:crypto";

import { ACCOUNT_HTTP_PROBLEMS } from "../application/account-http-problems";
import {
  accountMutationScope,
  fingerprintAccountMutation,
  isCanonicalAccountUuid,
  parseAccountApprovalInput,
  parseConfirmedAccountReasonInput,
  parseInternalReasonInput,
  parseRoleChangeInput,
} from "../domain/account-contracts";
import {
  accountMutationResponse,
  authorizeAdminAccountApi,
  buildAccountMutationCommand,
  guardExactAccountQuery,
  guardAccountMutationOrigin,
} from "./account-http";
import { getRuntimeAccountRepository } from "./runtime-account-data";
import { hashPassword } from "@/modules/auth/infrastructure/node-password";
import {
  acquireAccountCredentialWork,
  guardAccountOperationAttempt,
} from "@/modules/auth/infrastructure/login-security-guard";
import {
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIfMatchRevision,
  readJsonBody,
} from "@/platform/http";

function temporaryPassword() {
  return `K9-${randomBytes(18).toString("base64url")}`;
}

async function mutationContext(request: Request, userAccountId: string) {
  const authorization = await authorizeAdminAccountApi(request);
  if (!authorization.ok) return { ok: false as const, response: authorization.response };
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return { ok: false as const, response: queryFailure };
  const originFailure = guardAccountMutationOrigin(request, authorization.traceId);
  if (originFailure) return { ok: false as const, response: originFailure };
  if (!isCanonicalAccountUuid(userAccountId)) {
    return {
      ok: false as const,
      response: problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, {
        traceId: authorization.traceId,
      }),
    };
  }
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) {
    return {
      ok: false as const,
      response: problemResponse(problemForIfMatchRevisionError(revision.error), {
        traceId: authorization.traceId,
      }),
    };
  }
  return { ok: true as const, authorization, revision: revision.revision };
}

async function bodyOrProblem(request: Request, traceId?: string) {
  const body = await readJsonBody(request, { maximumBytes: 8 * 1024 });
  return body.ok
    ? ({ ok: true as const, value: body.value })
    : ({
        ok: false as const,
        response: problemResponse(problemForJsonBodyError(body.error), { traceId }),
      });
}

export async function handleAdminStatusMutation(
  request: Request,
  userAccountId: string,
  nextStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED",
) {
  const context = await mutationContext(request, userAccountId);
  if (!context.ok) return context.response;
  const body = await bodyOrProblem(request, context.authorization.traceId);
  if (!body.ok) return body.response;
  const input = nextStatus === "APPROVED"
    ? parseAccountApprovalInput(body.value)
    : parseConfirmedAccountReasonInput(body.value);
  if (!input.ok) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, {
      traceId: context.authorization.traceId,
    });
  }
  const scope = accountMutationScope(`status-${nextStatus.toLowerCase()}`, userAccountId);
  const command = buildAccountMutationCommand({
    request,
    session: context.authorization.session,
    scope,
    principalKey: `admin:${context.authorization.session.userId}`,
    requestFingerprint: fingerprintAccountMutation({
      action: `status-${nextStatus}`,
      target: userAccountId,
      revision: context.revision,
      ...input.value,
    }),
  });
  if (!command.ok) return command.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, {
      traceId: context.authorization.traceId,
    });
  }
  try {
    return accountMutationResponse(
      await repository.changeStatus(
        userAccountId,
        nextStatus,
        input.value,
        context.revision,
        command.command,
      ),
      context.authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, {
      traceId: context.authorization.traceId,
    });
  }
}

export async function handleAdminRoleMutation(request: Request, userAccountId: string) {
  const context = await mutationContext(request, userAccountId);
  if (!context.ok) return context.response;
  const body = await bodyOrProblem(request, context.authorization.traceId);
  if (!body.ok) return body.response;
  const input = parseRoleChangeInput(body.value);
  if (!input.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId: context.authorization.traceId });
  const scope = accountMutationScope("role", userAccountId);
  const command = buildAccountMutationCommand({
    request,
    session: context.authorization.session,
    scope,
    principalKey: `admin:${context.authorization.session.userId}`,
    requestFingerprint: fingerprintAccountMutation({
      action: "role",
      target: userAccountId,
      revision: context.revision,
      ...input.value,
    }),
  });
  if (!command.ok) return command.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  try {
    return accountMutationResponse(
      await repository.changeRole(
        userAccountId,
        input.value.role,
        input.value.internalReason,
        input.value.confirmLoginId,
        context.revision,
        command.command,
      ),
      context.authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  }
}

async function internalReasonMutationContext(request: Request, userAccountId: string, action: string) {
  const context = await mutationContext(request, userAccountId);
  if (!context.ok) return context;
  const body = await bodyOrProblem(request, context.authorization.traceId);
  if (!body.ok) return { ok: false as const, response: body.response };
  const input = parseInternalReasonInput(body.value);
  if (!input.ok) {
    return {
      ok: false as const,
      response: problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, {
        traceId: context.authorization.traceId,
      }),
    };
  }
  const scope = accountMutationScope(action, userAccountId);
  const command = buildAccountMutationCommand({
    request,
    session: context.authorization.session,
    scope,
    principalKey: `admin:${context.authorization.session.userId}`,
    requestFingerprint: fingerprintAccountMutation({
      action,
      target: userAccountId,
      revision: context.revision,
      internalReason: input.value.internalReason,
      confirmLoginId: input.value.confirmLoginId,
    }),
  });
  if (!command.ok) return { ok: false as const, response: command.response };
  return { ...context, ok: true as const, input: input.value, command: command.command };
}

export async function handleAdminPasswordReset(request: Request, userAccountId: string) {
  const context = await internalReasonMutationContext(request, userAccountId, "password-reset");
  if (!context.ok) return context.response;
  if (context.authorization.session.role !== "SUPER_ADMIN") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.forbidden, {
      traceId: context.authorization.traceId,
    });
  }
  const rateLimit = await guardAccountOperationAttempt(
    request,
    "admin-password-reset",
    context.authorization.session.userId,
  );
  if (!rateLimit.available) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, {
      traceId: context.authorization.traceId,
    });
  }
  if (!rateLimit.allowed) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId: context.authorization.traceId,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  const releaseWork = acquireAccountCredentialWork();
  if (!releaseWork) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId: context.authorization.traceId,
      headers: { "Retry-After": "1" },
    });
  }
  const temporary = temporaryPassword();
  try {
    const passwordHash = await hashPassword(temporary);
    return accountMutationResponse(
      await repository.resetPassword(
        userAccountId,
        passwordHash,
        temporary,
        context.input.internalReason,
        context.input.confirmLoginId,
        context.revision,
        context.command,
      ),
      context.authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  } finally {
    releaseWork();
  }
}

export async function handleAdminTotpReset(request: Request, userAccountId: string) {
  const context = await internalReasonMutationContext(request, userAccountId, "2fa-reset");
  if (!context.ok) return context.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  try {
    return accountMutationResponse(
      await repository.resetAdminTotp(
        userAccountId,
        context.input.internalReason,
        context.input.confirmLoginId,
        context.revision,
        context.command,
      ),
      context.authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  }
}

export async function handleAdminDelete(request: Request, userAccountId: string) {
  const context = await internalReasonMutationContext(request, userAccountId, "delete");
  if (!context.ok) return context.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  try {
    return accountMutationResponse(
      await repository.softDelete(
        userAccountId,
        context.input.internalReason,
        context.input.confirmLoginId,
        context.revision,
        context.command,
      ),
      context.authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  }
}

export async function handleAdminRestore(request: Request, userAccountId: string) {
  const context = await internalReasonMutationContext(request, userAccountId, "restore");
  if (!context.ok) return context.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  try {
    return accountMutationResponse(
      await repository.restore(
        userAccountId,
        context.input.internalReason,
        context.input.confirmLoginId,
        context.revision,
        context.command,
      ),
      context.authorization.traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: context.authorization.traceId });
  }
}
