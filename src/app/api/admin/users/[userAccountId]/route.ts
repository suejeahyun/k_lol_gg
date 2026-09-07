import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { isCanonicalAccountUuid, parseLegacyAccountIntegerId } from "@/modules/accounts/domain/account-contracts";
import { authorizeAdminAccountApi, guardExactAccountQuery } from "@/modules/accounts/infrastructure/account-http";
import { handleAdminDelete } from "@/modules/accounts/infrastructure/admin-account-route-handlers";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { noStoreJsonResponse, problemResponse } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ userAccountId: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await authorizeAdminAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const queryFailure = guardExactAccountQuery(request, [], authorization.traceId);
  if (queryFailure) return queryFailure;
  const { userAccountId } = await context.params;
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  try {
    if (!isCanonicalAccountUuid(userAccountId)) {
      const legacyId = parseLegacyAccountIntegerId(userAccountId);
      if (legacyId === null) {
        return problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
      }
      const canonicalId = await repository.resolveLegacyId(legacyId);
      if (!canonicalId) return problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
      return new Response(null, {
        status: 308,
        headers: { Location: `/api/admin/users/${canonicalId}`, "Cache-Control": "no-store" },
      });
    }
    const viewerRole = authorization.session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
    const account = await repository.findAdmin(userAccountId, viewerRole);
    return account
      ? noStoreJsonResponse({ account }, {
          traceId: authorization.traceId,
          headers: { ETag: `"${account.revision}"` },
        })
      : problemResponse(ACCOUNT_HTTP_PROBLEMS.notFound, { traceId: authorization.traceId });
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
}

export async function DELETE(request: Request, context: Context) {
  return handleAdminDelete(request, (await context.params).userAccountId);
}
