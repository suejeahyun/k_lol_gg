import { redirect } from "next/navigation";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";

export default async function AdminSecurityPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  await requirePageRole("ADMIN", "/admin");
  const target = normalizeInternalNext((await searchParams).next);
  redirect(target.split("?")[0] === "/admin/security" ? "/admin" : target);
}
