import { handleAdminStatusMutation } from "@/modules/accounts/infrastructure/admin-account-route-handlers";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ userAccountId: string }> }) {
  return handleAdminStatusMutation(request, (await context.params).userAccountId, "APPROVED");
}
