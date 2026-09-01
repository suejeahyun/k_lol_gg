import { noStoreSecurityHeaders } from "@/platform/http";
import { PLAYER_HTTP_PROBLEMS } from "@/modules/players/application/player-http-problems";
import { problemResponse } from "@/platform/http";
import { resolveRuntimePublicPlayerLegacyMapping } from "@/modules/players/infrastructure/runtime-public-player-legacy-mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ legacyId: string }> },
) {
  const { legacyId } = await context.params;
  const result = await resolveRuntimePublicPlayerLegacyMapping(legacyId);
  if (result.state === "unavailable" || result.state === "error") {
    return problemResponse(PLAYER_HTTP_PROBLEMS.unavailable);
  }
  if (!result.playerId) return problemResponse(PLAYER_HTTP_PROBLEMS.notFound);

  return new Response(null, {
    status: 308,
    headers: noStoreSecurityHeaders({
      // A relative Location is unconditionally same-origin and also survives
      // reverse proxies whose internal host differs from the public host.
      headers: { Location: `/players/${result.playerId}` },
    }),
  });
}
