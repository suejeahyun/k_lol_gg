import { handleAdminDelete } from "@/modules/accounts/infrastructure/admin-account-route-handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userAccountId: string }> },
) {
  return handleAdminDelete(request, (await context.params).userAccountId);
}

