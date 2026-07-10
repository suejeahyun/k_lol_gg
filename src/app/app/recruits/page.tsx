import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

type RecruitStatusFilter = "ALL" | "IN_PROGRESS" | "FINISHED" | "CANCELED" | "RESET";

type AppRecruitsPageProps = {
  searchParams?: Promise<{
    status?: string;
  }>;
};

const statusTabs: Array<{ key: RecruitStatusFilter; label: string }> = [
  { key: "ALL", label: "전체" },
  { key: "IN_PROGRESS", label: "진행중" },
  { key: "FINISHED", label: "마감" },
  { key: "CANCELED", label: "취소" },
  { key: "RESET", label: "초기화" },
];

function normalizeStatus(status?: string): RecruitStatusFilter {
  if (status === "IN_PROGRESS" || status === "FINISHED" || status === "CANCELED" || status === "RESET") {
    return status;
  }
  return "ALL";
}

function statusText(status: string) {
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "FINISHED") return "마감";
  if (status === "CANCELED") return "취소";
  if (status === "RESET") return "초기화";
  return status;
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    FLEX_RANK: "자유랭크",
    NORMAL_GAME: "일반",
    SOLO_RANK: "솔로랭크",
    ARAM: "칼바람",
    TFT_NORMAL: "전략적 팀 전투",
    TFT_RANK: "TFT 랭크",
    DOUBLE_UP: "더블업",
    PARTY_NUMBER: "번호 구인",
    PARTY_RIFT: "소환사의 협곡",
    OTHER_GAME: "기타",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export default async function AppRecruitsPage({ searchParams }: AppRecruitsPageProps) {
  const params = await searchParams;
  const activeStatus = normalizeStatus(params?.status);
  const siteSettings = await getSiteSettings();
  const parties = await prisma.recruitParty.findMany({
    where: activeStatus === "ALL" ? undefined : { status: activeStatus },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ status: "asc" }, { recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
    take: 16,
  });

  const counts = await prisma.recruitParty.groupBy({
    by: ["status"],
    _count: { _all: true },
  }).catch(() => []);
  const totalCount = counts.reduce((sum, item) => sum + item._count._all, 0);
  const countByStatus = new Map(counts.map((item) => [item.status, item._count._all]));

  return (
    <AppMobileShell subtitle="구인 현황">
      <PremiumFeatureGate feature="recruit" settings={siteSettings}>
        <section className="klol-app-hero">
          <div className="klol-app-kicker">RECRUIT</div>
          <h1 className="klol-app-title">구인 현황</h1>
          <nav className="klol-app-subtabs klol-app-subtabs--scroll" aria-label="구인 상태">
            {statusTabs.map((tab) => (
              <Link
                href={tab.key === "ALL" ? "/app/recruits" : `/app/recruits?status=${tab.key}`}
                key={tab.key}
                data-active={activeStatus === tab.key}
              >
                {tab.label}
                <small>{tab.key === "ALL" ? totalCount : countByStatus.get(tab.key) ?? 0}</small>
              </Link>
            ))}
          </nav>
        </section>

        <AppSection title={statusTabs.find((tab) => tab.key === activeStatus)?.label ?? "구인"} caption={`${parties.length}개`}>
          {parties.length === 0 ? (
            <AppEmpty>현재 표시할 구인이 없습니다.</AppEmpty>
          ) : (
            <div className="klol-app-list">
              {parties.map((party) => {
                const memberCount = party.members.length;
                const isClosed = party.status !== "IN_PROGRESS";
                return (
                  <article className="klol-app-list-card" data-muted={isClosed ? "true" : undefined} key={party.id}>
                    <div className="klol-app-list-top">
                      <div className="klol-app-list-title">
                        <strong>#{party.recruitNo} · {party.title || typeLabel(party.type)}</strong>
                        <span>{party.hostName || "호스트 미입력"} · {party.startTimeText || "시간 미정"}</span>
                      </div>
                      <span className={isClosed ? "klol-app-badge klol-app-badge--muted" : "klol-app-badge"}>
                        {statusText(party.status)}
                      </span>
                    </div>
                    <div className="klol-app-meta-grid">
                      <div className="klol-app-meta">
                        <span>인원</span>
                        <strong>{memberCount}/{party.maxMembers}</strong>
                      </div>
                      <div className="klol-app-meta">
                        <span>게임</span>
                        <strong>{typeLabel(party.type)}</strong>
                      </div>
                      <div className="klol-app-meta">
                        <span>음성방</span>
                        <strong>{party.roomName || "-"}</strong>
                      </div>
                    </div>
                    <p className="klol-app-muted">
                      {party.members.map((member) => `${member.position || "FILL"} ${member.name}`).join(" · ") || party.note || "참가자 없음"}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </AppSection>
      </PremiumFeatureGate>
    </AppMobileShell>
  );
}
