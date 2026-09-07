import { buildLegacyDestructionParticipantDestination, legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function location(context: { params: Promise<{ tournamentId: string; playerId: string }> }) {
  const { tournamentId, playerId } = await context.params;
  return buildLegacyDestructionParticipantDestination(tournamentId, playerId);
}
async function redirect(context: { params: Promise<{ tournamentId: string; playerId: string }> }) { return legacyRedirectResponse(await location(context)); }
export function GET(_request: Request, context: { params: Promise<{ tournamentId: string; playerId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ tournamentId: string; playerId: string }> }) { return redirect(context); }
