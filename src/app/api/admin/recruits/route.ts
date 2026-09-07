import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import {
  recruitingErrorResponse,
  recruitingReadResponse,
  recruitingUnavailableResponse,
  requireRecruitingApiSession,
} from "@/modules/recruiting/infrastructure/recruiting-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireRecruitingApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return recruitingErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(traceId);
  try {
    return recruitingReadResponse(await service.getAdminStatus(), traceId);
  } catch (error) {
    return recruitingErrorResponse(error, traceId);
  }
}
