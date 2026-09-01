import { AdminWorkspacePage } from "@/components/admin/admin-workspace-page";
import { getAdminWorkspace } from "@/modules/admin/domain/admin-workspaces";

export default function AdminDisciplinePage() {
  return <AdminWorkspacePage workspace={getAdminWorkspace("operations")} />;
}
