import { retiredAdminTotpResponse } from "@/modules/auth/infrastructure/admin-security-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return retiredAdminTotpResponse(request);
}

export async function DELETE(request: Request) {
  return retiredAdminTotpResponse(request);
}
