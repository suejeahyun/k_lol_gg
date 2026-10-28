import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { SiteWorkbench } from "@/components/community-sites/site-workbench";
export const dynamic = "force-dynamic";
export const metadata = { title: "내가 운영하는 사이트", robots: { index: false, follow: false } };
export default async function SitesPage() {
  if (SERVICE_BRAND.id !== "hub") notFound();
  await requirePageRole("USER", "/sites");
  return <SiteWorkbench mode="list" />;
}
