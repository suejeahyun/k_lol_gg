import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { guardExactAccountQuery } from "@/modules/accounts/infrastructure/account-http";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const session = await getCurrentSession("ACCOUNT");
  if (!session) return noStoreJsonResponse({ user: null }, { traceId });
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  try {
    const account = await repository.findSelf(session.userId);
    return account
      ? noStoreJsonResponse({ user: account, account }, { traceId, headers: { ETag: `"${account.revision}"` } })
      : noStoreJsonResponse({ user: null }, { traceId });
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  }
}
