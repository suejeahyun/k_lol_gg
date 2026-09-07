import { buildLegacyCanonicalIdDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function redirect(context: { params: Promise<{ draftId: string }> }) { return legacyRedirectResponse(buildLegacyCanonicalIdDestination("/tools/team-balance/drafts", (await context.params).draftId, "/tools/team-balance/drafts")); }
export function GET(_request: Request, context: { params: Promise<{ draftId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ draftId: string }> }) { return redirect(context); }
