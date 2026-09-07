import { PrivateAssetError } from "@/modules/assets/domain/private-asset";
import { getRuntimePublishedAssetService } from "@/modules/media/infrastructure/runtime-media";
import { definePublicProblem, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const notFound = definePublicProblem({ code: "ASSET_NOT_AVAILABLE", status: 404, title: "이미지를 찾을 수 없습니다.", detail: "게시 상태 또는 이미지 주소를 확인해 주세요." });
const unavailable = definePublicProblem({ code: "ASSET_STORAGE_UNAVAILABLE", status: 503, title: "이미지를 불러오지 못했습니다.", detail: "잠시 후 다시 시도해 주세요." });

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return problemResponse(notFound, { traceId });
  const service = getRuntimePublishedAssetService();
  if (!service) return problemResponse(unavailable, { traceId });
  try {
    const asset = await service.readPublished((await context.params).assetId);
    return new Response(Buffer.from(asset.bytes), {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.byteSize),
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        ...(traceId ? { "X-Trace-Id": traceId } : {}),
      },
    });
  } catch (error) {
    return problemResponse(error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE" ? notFound : unavailable, { traceId });
  }
}
