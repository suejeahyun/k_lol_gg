import { retiredAdminTotpResponse } from "@/modules/auth/infrastructure/admin-security-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return retiredAdminTotpResponse(request);
}
