import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function UserBalanceDraftsPage() {
  redirect("/players/balance/recommendations");
}
