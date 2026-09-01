import { noStoreSecurityHeaders } from "@/platform/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await context.params;
  return new Response(null, {
    status: 308,
    headers: noStoreSecurityHeaders({
      headers: { Location: `/admin/players/${encodeURIComponent(playerId)}?tab=riot` },
    }),
  });
}
