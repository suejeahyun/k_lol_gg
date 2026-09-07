import { buildLegacyAppLoginDestination, legacyQueryFromRequest, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

function redirect(request: Request) { return legacyRedirectResponse(buildLegacyAppLoginDestination(legacyQueryFromRequest(request))); }
export function GET(request: Request) { return redirect(request); }
export function HEAD(request: Request) { return redirect(request); }
