import { redirect } from "next/navigation";
import TeamBalancePage from "@/components/team-balance/TeamBalancePage";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

async function requireAccessOrRedirect(nextPath: string) {
  try {
    await requireApprovedUserOrAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }

    if (error instanceof Error && error.message === "NOT_APPROVED") {
      redirect("/me?status=not-approved");
    }

    throw error;
  }
}

export default async function UserTeamBalancePage() {
  await requireAccessOrRedirect("/players/balance");

  return <TeamBalancePage />;
}
