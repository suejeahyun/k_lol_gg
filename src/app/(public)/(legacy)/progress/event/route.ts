import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/competitions/events"); }
export function HEAD() { return legacyRedirectResponse("/competitions/events"); }
