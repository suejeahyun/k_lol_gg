import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/tools/team-balance"); }
export function HEAD() { return legacyRedirectResponse("/tools/team-balance"); }
