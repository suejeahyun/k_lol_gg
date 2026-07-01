import { redirect } from "next/navigation";

export default function RemovedPlayerApprovalsPage() {
  redirect("/admin/players");
}
