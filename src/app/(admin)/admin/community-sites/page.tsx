import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { SiteWorkbench } from "@/components/community-sites/site-workbench";
export const dynamic = "force-dynamic";
export default async function CommunitySitesAdminPage() {
  if (SERVICE_BRAND.id !== "hub") notFound();
  await requirePageRole("SUPER_ADMIN", "/admin/community-sites");
  return <SiteWorkbench mode="review" />;
}
