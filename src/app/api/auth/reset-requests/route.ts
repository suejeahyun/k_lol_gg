import { NextRequest } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import {
  normalizeLoginId,
  parseRecoveryInput,
} from "@/modules/accounts/domain/account-contracts";
import {
  guardAccountMutationOrigin,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import { submitPasswordResetRequest } from "@/modules/accounts/infrastructure/password-reset-request";
import {
  problemForJsonBodyError,
  problemResponse,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, traceId);
  if (originFailure) return originFailure;
  const body = await readJsonBody(request, { maximumBytes: 2 * 1024 });
  if (!body.ok) return problemResponse(problemForJsonBodyError(body.error), { traceId });
  const input = parseRecoveryInput(body.value);
  if (!input.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });
  const normalizedLoginId = normalizeLoginId(input.value.loginId);
  return submitPasswordResetRequest(request, normalizedLoginId, traceId);
}
