import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { authorizeAccountApi, guardExactAccountQuery } from "@/modules/accounts/infrastructure/account-http";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { noStoreJsonResponse, problemResponse } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return queryFailure;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  try {
    const account = await repository.findSelf(authorization.session.userId);
    return account
      ? noStoreJsonResponse(
          { player: account.player, playerClaim: account.playerClaim },
          { traceId: authorization.traceId },
        )
      : problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
}
