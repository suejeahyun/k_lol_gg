import { buildLegacyDestructionImageDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function location(context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) {
  const { tournamentId, imageIndex } = await context.params;
  return buildLegacyDestructionImageDestination(tournamentId, imageIndex);
}
async function redirect(context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) { return legacyRedirectResponse(await location(context)); }
export function GET(_request: Request, context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) { return redirect(context); }
