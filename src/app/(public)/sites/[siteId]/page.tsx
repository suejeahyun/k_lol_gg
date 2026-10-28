import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseCommunitySiteId } from "@/modules/community-sites/domain/community-site";
import { SiteWorkbench } from "@/components/community-sites/site-workbench";
export const dynamic = "force-dynamic";
export const metadata = { title: "사이트 꾸미기와 기능 관리", robots: { index: false, follow: false } };
export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  if (SERVICE_BRAND.id !== "hub") notFound();
  const { siteId } = await params;
  try { parseCommunitySiteId(siteId); } catch { notFound(); }
  await requirePageRole("USER", `/sites/${siteId}`);
  return <SiteWorkbench mode="owner" siteId={siteId} />;
}
