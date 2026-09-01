import { AdminWorkspacePage } from "@/components/admin/admin-workspace-page";
import { getAdminWorkspace } from "@/modules/admin/domain/admin-workspaces";

export default function AdminSeasonsPage() {
  return <AdminWorkspacePage workspace={getAdminWorkspace("seasons")} />;
}
