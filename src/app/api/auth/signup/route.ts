import { NextRequest } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import {
  fingerprintAccountMutation,
  normalizeLoginId,
  parseSignupInput,
} from "@/modules/accounts/domain/account-contracts";
import {
  accountMutationResponse,
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
  problemForJsonBodyError,
  problemResponse,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";
import { requireSiteFeature } from "@/modules/operations/infrastructure/site-feature-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, traceId);
  if (originFailure) return originFailure;
  const featureFailure = await requireSiteFeature(request, "registrations");
  if (featureFailure) return featureFailure;
  const body = await readJsonBody(request, { maximumBytes: 8 * 1024 });
  if (!body.ok) return problemResponse(problemForJsonBodyError(body.error), { traceId });
  const input = parseSignupInput(body.value);
  if (!input.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });

  const rateLimit = await guardAccountOperationAttempt(request, "signup", input.value.loginId);
  if (!rateLimit.available) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  if (!rateLimit.allowed) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }
  const scope = "account:signup";
  const command = buildAccountMutationCommand({
    request,
    scope,
    principalKey: `signup:${normalizeLoginId(input.value.loginId)}`,
    requestFingerprint: fingerprintAccountMutation({
      action: "signup",
      loginId: input.value.loginIdNormalized,
      memberName: input.value.memberNameNormalized,
      riotId: `${input.value.nicknameNormalized}#${input.value.tagLineNormalized}`,
      password: input.value.password,
    }),
  });
  if (!command.ok) return command.response;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });

  const releaseWork = acquireAccountCredentialWork();
  if (!releaseWork) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId,
      headers: { "Retry-After": "1" },
    });
  }

  try {
    const passwordHash = await hashPassword(input.value.password);
    return accountMutationResponse(
      await repository.signup(input.value, passwordHash, command.command),
      traceId,
    );
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  } finally {
    releaseWork();
  }
}
