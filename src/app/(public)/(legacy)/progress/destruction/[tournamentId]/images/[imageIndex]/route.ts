import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

async function location(context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) {
  const { tournamentId, imageIndex } = await context.params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(tournamentId) || !/^(?:0|[1-9][0-9]{0,3})$/u.test(imageIndex)) return "/competitions?type=destruction";
  return `/competitions/destruction/${tournamentId}?tab=gallery&image=${imageIndex}`;
}
async function redirect(context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) { return legacyRedirectResponse(await location(context)); }
export function GET(_request: Request, context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) { return redirect(context); }
export function HEAD(_request: Request, context: { params: Promise<{ tournamentId: string; imageIndex: string }> }) { return redirect(context); }
