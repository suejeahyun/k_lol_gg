import { buildLegacyCanonicalIdDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function redirect(context: { params: Promise<{ tournamentId: string }> }) { return legacyRedirectResponse(buildLegacyCanonicalIdDestination("/competitions/destruction", (await context.params).tournamentId, "/competitions?type=destruction")); }
export function GET(_request: Request, context: { params: Promise<{ tournamentId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ tournamentId: string }> }) { return redirect(context); }
