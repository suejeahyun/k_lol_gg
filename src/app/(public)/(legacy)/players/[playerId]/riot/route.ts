import { buildLegacyCanonicalIdDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function redirect(context: { params: Promise<{ playerId: string }> }) { return legacyRedirectResponse(buildLegacyCanonicalIdDestination("/players", (await context.params).playerId, "/players", { tab: "riot" })); }
export function GET(_request: Request, context: { params: Promise<{ playerId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ playerId: string }> }) { return redirect(context); }
