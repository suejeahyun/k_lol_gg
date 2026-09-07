import { legacyQueryFromRequest, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";
import { buildLegacyStatisticsDestination } from "@/modules/navigation/application/legacy-statistics-redirects";

function redirect(request: Request) {
  const query = legacyQueryFromRequest(request);
  return legacyRedirectResponse(buildLegacyStatisticsDestination({ seasonId: query.seasonId, minParticipation: query.minParticipation }));
}
export function GET(request: Request) { return redirect(request); }
export function HEAD(request: Request) { return redirect(request); }
