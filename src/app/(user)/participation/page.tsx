export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";

export const metadata: Metadata = {
  title: "참여할 이벤트 찾기",
  description: "모집 중이거나 예정된 K-LOL.GG 이벤트를 찾고 내 신청 상태를 확인하세요.",
  alternates: { canonical: "/participation" },
};

type HubItem = {
  key: string;
  title: string;
  kindLabel: "이벤트 내전" | "멸망전";
  status: string;
  date: Date | null;
  href: string;
};

type MyApplication = {
  key: string;
  title: string;
  kindLabel: "이벤트 내전" | "멸망전";
  status: string;
  href: string;
};

const sections = [
  { key: "recruiting", label: "모집 중", statuses: new Set<string>(["RECRUITING"]) },
  { key: "planned", label: "예정", statuses: new Set<string>(["PLANNED"]) },
  {
    key: "active",
    label: "진행 중",
    statuses: new Set<string>([
      "TEAM_BUILDING",
      "IN_PROGRESS",
      "AUCTION",
      "PRELIMINARY",
      "TOURNAMENT",
    ]),
  },
  { key: "completed", label: "완료", statuses: new Set<string>(["COMPLETED"]) },
] as const;

const statusLabels: Record<string, string> = {
  PLANNED: "예정",
  RECRUITING: "모집 중",
  TEAM_BUILDING: "팀 구성 중",
  IN_PROGRESS: "진행 중",
  AUCTION: "경매 진행 중",
  PRELIMINARY: "예선 진행 중",
  TOURNAMENT: "토너먼트 진행 중",
  COMPLETED: "완료",
};

const applicationStatusLabels: Record<string, string> = {
  APPLIED: "신청 접수",
  CONFIRMED: "참가 확정",
  REJECTED: "신청 거절",
  RESERVE: "예비 참가",
  CANCELLED: "신청 취소",
};

function formatDate(value: Date | null) {
  if (!value) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function eventHref(id: number, status: string) {
  return status === "RECRUITING"
    ? `/participation/event/${id}`
    : `/progress/event/${id}`;
}

function destructionHref(id: number, status: string) {
  return status === "RECRUITING"
    ? `/participation/destruction/${id}`
    : `/progress/destruction/${id}`;
}

export default async function ParticipationPage() {
  const user = await getCurrentUser();
  const [events, destructions, eventApplications, destructionApplications] = await Promise.all([
    prisma.eventMatch.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, title: true, status: true, eventDate: true },
      orderBy: [{ eventDate: "desc" }, { id: "desc" }],
      take: 40,
    }),
    prisma.destructionTournament.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, title: true, status: true, startDate: true },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 40,
    }),
    user?.playerId
      ? prisma.eventParticipationApply.findMany({
          where: { playerId: user.playerId },
          select: {
            id: true,
            status: true,
            event: { select: { id: true, title: true, status: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    user?.playerId
      ? prisma.destructionParticipationApply.findMany({
          where: { playerId: user.playerId },
          select: {
            id: true,
            status: true,
            tournament: { select: { id: true, title: true, status: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const items: HubItem[] = [
    ...events.map((event) => ({
      key: `event-${event.id}`,
      title: event.title,
      kindLabel: "이벤트 내전" as const,
      status: event.status,
      date: event.eventDate,
      href: eventHref(event.id, event.status),
    })),
    ...destructions.map((tournament) => ({
      key: `destruction-${tournament.id}`,
      title: tournament.title,
      kindLabel: "멸망전" as const,
      status: tournament.status,
      date: tournament.startDate,
      href: destructionHref(tournament.id, tournament.status),
    })),
  ];

  const myApplications: MyApplication[] = [
    ...eventApplications.map((application) => ({
      key: `event-application-${application.id}`,
      title: application.event.title,
      kindLabel: "이벤트 내전" as const,
      status: application.status,
      href: eventHref(application.event.id, application.event.status),
    })),
    ...destructionApplications.map((application) => ({
      key: `destruction-application-${application.id}`,
      title: application.tournament.title,
      kindLabel: "멸망전" as const,
      status: application.status,
      href: destructionHref(application.tournament.id, application.tournament.status),
    })),
  ];

  return (
    <main className="page-container participation-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">PARTICIPATION</p>
          <h1 className="page-title">참여할 이벤트 찾기</h1>
          <p className="page-description">
            모집 여부와 진행 단계를 한곳에서 확인하고, 모집 중인 이벤트에 바로 참여하세요.
          </p>
        </div>
      </div>

      {sections.map((section) => {
        const sectionItems = items.filter((item) => section.statuses.has(item.status));
        return (
          <section key={section.key} aria-labelledby={`participation-${section.key}`}>
            <h2 id={`participation-${section.key}`}>{section.label}</h2>
            <div className="participation-grid">
              {sectionItems.length > 0 ? (
                sectionItems.map((item) => (
                  <Link className="participation-card" href={item.href} key={item.key}>
                    <div className="participation-card__top">
                      <span>{statusLabels[item.status] ?? item.status}</span>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.kindLabel} · {formatDate(item.date)}</p>
                    <strong>{item.status === "RECRUITING" ? "참여 정보 확인" : "진행 현황 확인"}</strong>
                  </Link>
                ))
              ) : (
                <article className="participation-card participation-card--disabled">
                  <h2>{section.label} 일정 없음</h2>
                  <p>현재 이 단계에 해당하는 이벤트가 없습니다.</p>
                </article>
              )}
            </div>
          </section>
        );
      })}

      <section aria-labelledby="my-participation-applications">
        <h2 id="my-participation-applications">내 신청</h2>
        {!user ? (
          <div className="participation-grid">
            <Link className="participation-card" href="/login?next=/participation">
              <h2>로그인 후 확인</h2>
              <p>로그인하면 신청 접수·확정·예비 참가 상태를 확인할 수 있습니다.</p>
              <strong>로그인</strong>
            </Link>
          </div>
        ) : myApplications.length > 0 ? (
          <div className="participation-grid">
            {myApplications.map((application) => (
              <Link className="participation-card" href={application.href} key={application.key}>
                <div className="participation-card__top">
                  <span>{applicationStatusLabels[application.status] ?? application.status}</span>
                </div>
                <h2>{application.title}</h2>
                <p>{application.kindLabel}</p>
                <strong>신청 상세 확인</strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="participation-grid">
            <article className="participation-card participation-card--disabled">
              <h2>신청 내역 없음</h2>
              <p>아직 신청한 이벤트가 없습니다. 모집 중 목록에서 참여할 이벤트를 찾아보세요.</p>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
