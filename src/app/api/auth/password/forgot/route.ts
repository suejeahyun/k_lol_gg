import { NextRequest } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { normalizeLoginId } from "@/modules/accounts/domain/account-contracts";
import {
  guardAccountMutationOrigin,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import { submitPasswordResetRequest } from "@/modules/accounts/infrastructure/password-reset-request";
import { containsUnsafeText } from "@/platform/security/input-safety";
import {
  problemForJsonBodyError,
  problemResponse,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, traceId);
  if (originFailure) return originFailure;
  const body = await readJsonBody(request, { maximumBytes: 4 * 1024 });
  if (!body.ok) return problemResponse(problemForJsonBodyError(body.error), { traceId });
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });
  }
  const record = body.value as Record<string, unknown>;
  const expectedKeys = ["name", "nickname", "tag", "userId"];
  const keys = Object.keys(record).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });
  }
  const values = expectedKeys.map((key) => typeof record[key] === "string"
    ? record[key].trim().normalize("NFKC")
    : "");
  if (
    values.some((value) => value.length === 0 || containsUnsafeText(value)) ||
    values[0]!.length > 50 ||
    values[1]!.length > 100 ||
    values[2]!.replace(/^#/, "").length > 30 ||
    values[3]!.length > 64
  ) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });
  }
  return submitPasswordResetRequest(request, normalizeLoginId(values[3]!), traceId);
}
