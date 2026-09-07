import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { isCanonicalAccountUuid, parseLegacyAccountIntegerId } from "@/modules/accounts/domain/account-contracts";
import { authorizeAdminAccountApi, guardExactAccountQuery } from "@/modules/accounts/infrastructure/account-http";
import { handleAdminPasswordReset } from "@/modules/accounts/infrastructure/admin-account-route-handlers";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { problemResponse } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const authorization = await authorizeAdminAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return queryFailure;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  try {
    const playerId = (await context.params).playerId;
    if (!isCanonicalAccountUuid(playerId) && parseLegacyAccountIntegerId(playerId) === null) {
      return problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
    }
    const userAccountId = await repository.resolvePlayerAccount(playerId);
    if (!userAccountId) return problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
    // This is a service adapter, not a redirect: the same canonical mutation
    // executes with the original Origin, If-Match and Idempotency-Key headers.
    return handleAdminPasswordReset(request, userAccountId);
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
}
