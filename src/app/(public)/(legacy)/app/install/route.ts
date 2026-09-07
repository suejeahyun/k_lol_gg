import { legacyRedirectResponse } from "@/modules/navigation/application/legacy-user-redirects";

export function GET() { return legacyRedirectResponse("/install"); }
export function HEAD() { return legacyRedirectResponse("/install"); }
