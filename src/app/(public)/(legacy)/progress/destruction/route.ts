import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/competitions?type=destruction"); }
export function HEAD() { return legacyRedirectResponse("/competitions?type=destruction"); }
