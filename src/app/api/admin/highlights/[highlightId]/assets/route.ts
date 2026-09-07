import { listMediaDraftAssets, uploadMediaDraftAsset } from "@/modules/media/infrastructure/admin-media-asset-route";
import { requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";

export const dynamic = "force-dynamic";
const resource = { resourceType: "HIGHLIGHT", purpose: "HIGHLIGHT_THUMBNAIL" } as const;

export async function GET(request: Request, context: { params: Promise<{ highlightId: string }> }) {
  const auth = await requireMediaAdminSession();
  return auth.ok ? listMediaDraftAssets(request, auth.session, (await context.params).highlightId, resource) : auth.response;
}

export async function POST(request: Request, context: { params: Promise<{ highlightId: string }> }) {
  const auth = await requireMediaAdminSession();
  return auth.ok ? uploadMediaDraftAsset(request, auth.session, (await context.params).highlightId, resource) : auth.response;
}
