import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/account?tab=player"); }
export function HEAD() { return legacyRedirectResponse("/account?tab=player"); }
