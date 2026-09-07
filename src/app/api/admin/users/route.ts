import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { parseAdminAccountQuery } from "@/modules/accounts/application/parse-admin-account-query";
import { authorizeAdminAccountApi } from "@/modules/accounts/infrastructure/account-http";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { noStoreJsonResponse, problemResponse } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAdminAccountApi(request);
  if (!authorization.ok) return authorization.response;
  const query = parseAdminAccountQuery(new URL(request.url).searchParams);
  if (!query.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidQuery, { traceId: authorization.traceId });
  const repository = getRuntimeAccountRepository();
  if (!repository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  try {
    const viewerRole = authorization.session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
    return noStoreJsonResponse(await repository.listAdmin(query.value, viewerRole), {
      traceId: authorization.traceId,
    });
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId: authorization.traceId });
  }
}
