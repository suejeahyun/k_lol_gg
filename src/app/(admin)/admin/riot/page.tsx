import { AdminWorkspacePage } from "@/components/admin/admin-workspace-page";
import { getAdminWorkspace } from "@/modules/admin/domain/admin-workspaces";

export default function AdminRiotPage() {
  return <AdminWorkspacePage workspace={getAdminWorkspace("integrations")} />;
}
