import AdminSecurityTwoFactorClient from "./_components/AdminSecurityTwoFactorClient";
import { safeLocalNextPath } from "@/lib/navigation/safe-next";

export const dynamic = "force-dynamic";

type AdminSecurityPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function AdminSecurityPage({ searchParams }: AdminSecurityPageProps) {
  const params = await searchParams;
  const nextPath = safeLocalNextPath(params?.next, { fallback: "/admin/matches" });

  return <AdminSecurityTwoFactorClient nextPath={nextPath} />;
}
