import { getServiceOrigin, SERVICE_BRAND } from "@/lib/service-brand";
import { toPublicCommunityIntroductionDto } from "@/modules/operations/domain/community-introduction";
import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { operationsErrorResponse, operationsUnavailableResponse } from "@/modules/operations/infrastructure/operations-http";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

function notPublished(traceId?: string) {
  return problemResponse(definePublicProblem({ code: "NOT_FOUND", status: 404, title: "공개된 소개가 없습니다.", detail: "이 사이트는 아직 소개를 공개하지 않았습니다." }), { traceId });
}

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (SERVICE_BRAND.id === "hub") return notPublished(traceId);
  if (new URL(request.url).searchParams.size > 0) return operationsErrorResponse(new Error("INVALID_QUERY"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    // Canonical configuration, never the caller's Host or forwarded headers.
    const introduction = toPublicCommunityIntroductionDto(await repository.getCommunityIntroduction(), getServiceOrigin().origin);
    return introduction ? noStoreJsonResponse(introduction, { traceId }) : notPublished(traceId);
  } catch (error) { return operationsErrorResponse(error, traceId); }
}
