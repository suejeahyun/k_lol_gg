import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminDiscordDisciplinePage() {
  redirect("/admin/discipline?source=discord");
}
