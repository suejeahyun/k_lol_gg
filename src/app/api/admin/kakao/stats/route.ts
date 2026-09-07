import { requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { kakaoAdminErrorResponse, kakaoAdminReadResponse } from "@/modules/recruiting/kakao-admin/http";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireOperationsApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return kakaoAdminErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeRecruitingService(); if (!service) return kakaoAdminErrorResponse(new Error("UNAVAILABLE"), traceId);
  try { return kakaoAdminReadResponse({ status: await service.getAdminStatus() }, traceId); }
  catch (error) { return kakaoAdminErrorResponse(error, traceId); }
}
