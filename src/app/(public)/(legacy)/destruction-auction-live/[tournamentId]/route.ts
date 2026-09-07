import { buildLegacyCanonicalIdDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function redirect(context: { params: Promise<{ tournamentId: string }> }) { return legacyRedirectResponse(buildLegacyCanonicalIdDestination("/admin/progress/destruction", (await context.params).tournamentId, "/admin/progress/destruction", { tab: "auction", mode: "live" })); }
export function GET(_request: Request, context: { params: Promise<{ tournamentId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ tournamentId: string }> }) { return redirect(context); }
