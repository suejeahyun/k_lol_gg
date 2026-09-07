import { permanentRedirect } from "next/navigation";

export default async function AdminAiRequestsPage() {
  permanentRedirect("/admin/logs?view=ai-requests");
}
