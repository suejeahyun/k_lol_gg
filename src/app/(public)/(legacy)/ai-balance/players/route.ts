import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/rankings/mmr?view=players"); }
export function HEAD() { return legacyRedirectResponse("/rankings/mmr?view=players"); }
