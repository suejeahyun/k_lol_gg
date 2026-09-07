import { handleAdminPasswordReset } from "@/modules/accounts/infrastructure/admin-account-route-handlers";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ userAccountId: string }> }) {
  return handleAdminPasswordReset(request, (await context.params).userAccountId);
}
