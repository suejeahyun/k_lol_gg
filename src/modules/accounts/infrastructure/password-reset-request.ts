import "server-only";

import type { NextRequest } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "../application/account-http-problems";
import {
  beginRecoveryResponseWindow,
  finishRecoveryResponseWindow,
} from "../application/recovery-response-timing";
import { fingerprintAccountMutation } from "../domain/account-contracts";
import {
  accountMutationResponse,
  buildAccountMutationCommand,
  hashRecoveryLoginId,
} from "./account-http";
import { getRuntimeAccountRepository } from "./runtime-account-data";
import { guardAccountOperationAttempt } from "@/modules/auth/infrastructure/login-security-guard";
import { problemResponse } from "@/platform/http";

export async function submitPasswordResetRequest(
  request: NextRequest,
  normalizedLoginId: string,
  traceId?: string,
) {
  const rateLimit = await guardAccountOperationAttempt(request, "recovery", normalizedLoginId);
  if (!rateLimit.available) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  if (!rateLimit.allowed) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }
  const loginIdHash = hashRecoveryLoginId(normalizedLoginId);
  if (!loginIdHash) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  const command = buildAccountMutationCommand({
    request,
    scope: "account:reset-request",
    principalKey: `recovery:${normalizedLoginId}`,
    requestFingerprint: fingerprintAccountMutation({ action: "reset-request", normalizedLoginId }),
  });
  if (!command.ok) return command.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  const responseWindow = beginRecoveryResponseWindow();
  try {
    const response = accountMutationResponse(
      await repository.requestPasswordReset(normalizedLoginId, loginIdHash, command.command),
      traceId,
    );
    await finishRecoveryResponseWindow(responseWindow);
    return response;
  } catch {
    await finishRecoveryResponseWindow(responseWindow);
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  }
}
