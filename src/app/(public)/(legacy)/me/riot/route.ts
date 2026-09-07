import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/account/riot"); }
export function HEAD() { return legacyRedirectResponse("/account/riot"); }
