import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/help/recruits"); }
export function HEAD() { return legacyRedirectResponse("/help/recruits"); }
