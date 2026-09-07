import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/competitions?type=event"); }
export function HEAD() { return legacyRedirectResponse("/competitions?type=event"); }
