import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { SiteWorkbench } from "@/components/community-sites/site-workbench";
import { COMMUNITY_TEMPLATES } from "@/modules/community-sites/domain/site-configuration";
export const dynamic = "force-dynamic";
export const metadata = { title: "커뮤니티 만들기", robots: { index: false, follow: false } };
export default async function CreateSitePage({ searchParams }: { searchParams: Promise<{ theme?: string | string[] }> }) {
  if (SERVICE_BRAND.id !== "hub") notFound();
  const { theme } = await searchParams;
  const template = COMMUNITY_TEMPLATES.find(item => item.id === theme);
  await requirePageRole("USER", template ? `/sites/new?theme=${template.id}` : "/sites/new");
  return <SiteWorkbench key={template?.id ?? "arena"} mode="create" initialTemplate={template?.id ?? "arena"} />;
}
