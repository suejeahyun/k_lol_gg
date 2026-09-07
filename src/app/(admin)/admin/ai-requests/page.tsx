import { permanentRedirect } from "next/navigation";

export default function AdminAiRequestsAliasPage() {
  permanentRedirect("/admin/logs?view=ai-requests");
}
