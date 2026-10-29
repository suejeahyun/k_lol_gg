import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { findHubCommunity, loadHubCommunityIntroduction } from "@/modules/community-network/infrastructure/hub-community-directory";
import { HubCommunityDetail, HubCommunityDetailUnavailable } from "@/components/hub/hub-community-detail";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const readCommunity = cache(async (id: string) => {
  if (SERVICE_BRAND.id !== "hub" || !uuid.test(id)) return { state: "missing" as const };
  try { const community = await findHubCommunity(id.toLowerCase()); return community ? { state: "ready" as const, community } : { state: "missing" as const }; }
  catch { return { state: "unavailable" as const }; }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await readCommunity(id);
  if (result.state !== "ready") return { title: "커뮤니티 소개", robots: { index: false, follow: false } };
  return { title: `${result.community.name} 소개`, description: result.community.description.slice(0, 160) || `${result.community.name}의 활동과 참여 안내를 확인하세요.`,
    alternates: { canonical: `/community-network/${result.community.id}` }, robots: { index: true, follow: true } };
}

export default async function CommunityDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await readCommunity(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return <HubCommunityDetailUnavailable />;
  const introduction = await loadHubCommunityIntroduction(result.community.origin).catch(() => ({ state: "unavailable" as const }));
  return <HubCommunityDetail community={result.community} introduction={introduction} />;
}
