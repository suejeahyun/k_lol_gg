import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/recruits"); }
export function HEAD() { return legacyRedirectResponse("/recruits"); }
