import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/help/kakao"); }
export function HEAD() { return legacyRedirectResponse("/help/kakao"); }
