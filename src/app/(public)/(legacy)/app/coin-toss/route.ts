import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/tools/coin-toss"); }
export function HEAD() { return legacyRedirectResponse("/tools/coin-toss"); }
