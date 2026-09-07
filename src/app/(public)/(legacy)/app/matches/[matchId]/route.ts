import { buildLegacyCanonicalIdDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function redirect(context: { params: Promise<{ matchId: string }> }) { return legacyRedirectResponse(buildLegacyCanonicalIdDestination("/matches", (await context.params).matchId, "/matches")); }
export function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ matchId: string }> }) { return redirect(context); }
