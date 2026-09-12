import { requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { kakaoAdminErrorResponse, kakaoAdminReadResponse } from "@/modules/recruiting/kakao-admin/http";
import { KakaoAdminError } from "@/modules/recruiting/kakao-admin/postgres-kakao-admin";
import { parsePartyMemberStatsQuery } from "@/modules/recruiting/application/party-member-statistics";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireOperationsApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].some((key) => key !== "q") || searchParams.getAll("q").length > 1) {
    return kakaoAdminErrorResponse(new KakaoAdminError("INVALID_INPUT"), traceId);
  }
  const query = parsePartyMemberStatsQuery(searchParams.get("q"));
  if (query.state === "invalid") return kakaoAdminErrorResponse(new KakaoAdminError("INVALID_INPUT"), traceId);
  const service = getRuntimeRecruitingService(); if (!service) return kakaoAdminErrorResponse(new Error("UNAVAILABLE"), traceId);
  try {
    const [status, memberStats] = await Promise.all([
      service.getAdminStatus(),
      query.state === "ready" ? service.getPartyMemberStats(query.query) : Promise.resolve(null),
    ]);
    return kakaoAdminReadResponse({ status, memberStats }, traceId);
  }
  catch (error) { return kakaoAdminErrorResponse(error, traceId); }
}
