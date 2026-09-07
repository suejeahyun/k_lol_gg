import { legacyQueryFromRequest, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";
import { buildLegacyRandomTeamDestination } from "@/modules/navigation/application/legacy-team-tool-redirects";

function redirect(request: Request) { return legacyRedirectResponse(buildLegacyRandomTeamDestination(legacyQueryFromRequest(request))); }
export function GET(request: Request) { return redirect(request); }
export function HEAD(request: Request) { return redirect(request); }
