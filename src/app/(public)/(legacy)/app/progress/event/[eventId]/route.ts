import { buildLegacyCanonicalIdDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function redirect(context: { params: Promise<{ eventId: string }> }) { return legacyRedirectResponse(buildLegacyCanonicalIdDestination("/competitions/events", (await context.params).eventId, "/competitions?type=event")); }
export function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ eventId: string }> }) { return redirect(context); }
