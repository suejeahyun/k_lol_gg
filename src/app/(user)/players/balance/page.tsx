import { redirect } from "next/navigation";

export default function LegacyTeamBalancePage() {
  redirect("/admin/balance");
}
