import { SERVICE_BRAND } from "@/lib/service-brand";
import { readRuntimeCommunitySiteConfiguration } from "@/modules/community-sites/infrastructure/runtime-site-configuration";
export const dynamic = "force-dynamic";
export async function GET() {
  if (SERVICE_BRAND.id !== "community") return new Response(null, { status: 404 });
  try {
    const result = await readRuntimeCommunitySiteConfiguration();
    if (!result) throw new Error("UNAVAILABLE");
    return Response.json({ communityId: result.communityId, revision: result.revision, publicationState: result.publicationState }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ code: "COMMUNITY_CONFIGURATION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
