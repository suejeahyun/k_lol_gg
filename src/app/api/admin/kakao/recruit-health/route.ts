import { KakaoAdminError } from "@/modules/recruiting/kakao-admin/postgres-kakao-admin";
import { readKakaoRuntimeConfiguration } from "@/modules/recruiting/kakao-admin/domain";
import { kakaoAdminErrorResponse, kakaoAdminReadResponse } from "@/modules/recruiting/kakao-admin/http";
import { getRuntimeKakaoAdmin } from "@/modules/recruiting/kakao-admin/runtime";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { operationsActor, operationsMutationResponse, prepareOperationsMutation, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireOperationsApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return kakaoAdminErrorResponse(new Error("INVALID_QUERY"), traceId);
  const recruiting = getRuntimeRecruitingService(); const admin = getRuntimeKakaoAdmin();
  if (!recruiting || !admin) return kakaoAdminErrorResponse(new Error("UNAVAILABLE"), traceId);
  try { return kakaoAdminReadResponse({ status: await recruiting.getAdminStatus(), settings: await admin.getSettings(), runtime: readKakaoRuntimeConfiguration() }, traceId); }
  catch (error) { return kakaoAdminErrorResponse(error, traceId); }
}

export async function POST(request: Request) {
  const auth = await requireOperationsApiSession("SUPER_ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareOperationsMutation(request, 1024); if (!prepared.ok) return prepared.response;
  if (!prepared.body || typeof prepared.body !== "object" || Array.isArray(prepared.body) || JSON.stringify(prepared.body) !== JSON.stringify({ action: "REPAIR_EXPIRED_SESSIONS" })) return kakaoAdminErrorResponse(new KakaoAdminError("INVALID_INPUT"), prepared.traceId);
  const admin = getRuntimeKakaoAdmin(); if (!admin) return kakaoAdminErrorResponse(new Error("UNAVAILABLE"), prepared.traceId);
  try { return operationsMutationResponse(await admin.repairExpiredSessions({ actor: operationsActor(auth.session), metadata: prepared.metadata }), prepared.traceId); }
  catch (error) { return kakaoAdminErrorResponse(error, prepared.traceId); }
}
