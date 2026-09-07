import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function location(context: { params: Promise<{ tournamentId: string; playerId: string }> }) {
  const { tournamentId, playerId } = await context.params;
  const safe = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
  return safe.test(tournamentId) && safe.test(playerId)
    ? `/competitions/destruction/${tournamentId}?tab=participants&player=${playerId}`
    : "/applications";
}
async function redirect(context: { params: Promise<{ tournamentId: string; playerId: string }> }) { return legacyRedirectResponse(await location(context)); }
export function GET(_request: Request, context: { params: Promise<{ tournamentId: string; playerId: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ tournamentId: string; playerId: string }> }) { return redirect(context); }
