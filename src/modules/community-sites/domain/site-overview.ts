import type { CommunitySite, CommunitySiteStatus } from "./community-site";

export const COMMUNITY_SITE_STATUS_LABELS: Record<CommunitySiteStatus, string> = {
  SUBMITTED: "심사 대기", CHANGES_REQUESTED: "보완 요청", REJECTED: "반려", CANCELLED: "신청 취소",
  APPROVED: "개설 대기", PROVISIONING: "개설 중", AWAITING_OWNER: "소유자 확인 대기", ACTIVATING: "공개 처리·상태 확인 중", ACTIVE: "운영 중", FAILED: "개설 확인 필요",
};
export const SITE_OVERVIEW_FILTERS = [
  { id: "all", label: "전체" }, { id: "attention", label: "확인할 일" },
  { id: "preparing", label: "개설 진행" }, { id: "active", label: "운영 중" }, { id: "closed", label: "반려·취소" },
] as const;
export type SiteOverviewFilter = typeof SITE_OVERVIEW_FILTERS[number]["id"];

export function communitySiteNeedsAttention(site: CommunitySite): boolean {
  return ["CHANGES_REQUESTED", "AWAITING_OWNER", "REJECTED", "FAILED"].includes(site.status) || site.latestJob?.status === "FAILED";
}
export function matchesSiteOverviewFilter(site: CommunitySite, filter: SiteOverviewFilter): boolean {
  switch (filter) {
    case "attention": return communitySiteNeedsAttention(site);
    case "preparing": return ["SUBMITTED", "APPROVED", "PROVISIONING", "AWAITING_OWNER", "ACTIVATING"].includes(site.status);
    case "active": return site.status === "ACTIVE";
    case "closed": return site.status === "REJECTED" || site.status === "CANCELLED";
    default: return true;
  }
}
export function filterOwnedCommunitySites(sites: readonly CommunitySite[], filter: SiteOverviewFilter, query: string): CommunitySite[] {
  const terms = query.normalize("NFKC").toLocaleLowerCase("ko-KR").trim().split(/\s+/u).filter(Boolean);
  return sites.filter(site => {
    const content = `${site.configuration.name} ${site.configuration.slug} ${site.configuration.description} ${site.origin ?? ""}`.normalize("NFKC").toLocaleLowerCase("ko-KR");
    return matchesSiteOverviewFilter(site, filter) && terms.every(term => content.includes(term));
  }).sort((a, b) => Number(communitySiteNeedsAttention(b)) - Number(communitySiteNeedsAttention(a)) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
