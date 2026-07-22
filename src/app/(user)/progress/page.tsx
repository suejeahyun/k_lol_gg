export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

export const metadata: Metadata = {
  title: "이벤트·멸망전 진행 현황",
  description: "K-LOL.GG 이벤트 내전과 멸망전의 모집, 팀 구성, 경기 진행 현황을 확인하세요.",
  alternates: { canonical: "/progress" },
};

function formatDate(date: Date | null) {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function getEventStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: "기획중",
    RECRUITING: "모집중",
    TEAM_BUILDING: "팀 구성중",
    IN_PROGRESS: "진행중",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getDestructionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: "기획중",
    RECRUITING: "모집중",
    TEAM_BUILDING: "팀 구성중",
    AUCTION: "경매 진행",
    PRELIMINARY: "예선 진행",
    TOURNAMENT: "토너먼트 진행",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

export default async function ProgressPage() {
  const [
    latestEvent,
    totalEvents,
    completedEvents,
    latestDestruction,
    totalDestructions,
    completedDestructions,
  ] = await Promise.all([
    prisma.eventMatch.findFirst({
      orderBy: {
        eventDate: "desc",
      },
      select: {
        title: true,
        status: true,
        eventDate: true,
        _count: {
          select: { teams: true, participants: true },
        },
      },
    }),

    prisma.eventMatch.count(),

    prisma.eventMatch.count({
      where: {
        status: "COMPLETED",
      },
    }),

    prisma.destructionTournament.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        title: true,
        status: true,
        startDate: true,
        _count: {
          select: { teams: true, participants: true },
        },
      },
    }),

    prisma.destructionTournament.count(),

    prisma.destructionTournament.count({
      where: {
        status: "COMPLETED",
      },
    }),
  ]);

  return (
    <main className="page-container progress-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">PROGRESS</p>
          <h1 className="page-title">진행 현황</h1>
        </div>
      </div>

      <section className="progress-overview-grid">
        <Link href="/progress/event" className="progress-overview-card">
          <div className="progress-overview-card__top">
            <span>EVENT MATCH</span>
            <strong>이벤트 내전</strong>
          </div>

          <p>월간 이벤트 내전의 모집, 팀 구성, 대진표, 결과를 확인합니다.</p>

          <div className="progress-overview-card__stats">
            <div>
              <span>전체 이벤트</span>
              <strong>{totalEvents}</strong>
            </div>

            <div>
              <span>완료 이벤트</span>
              <strong>{completedEvents}</strong>
            </div>
          </div>

          {latestEvent ? (
            <div className="progress-overview-card__latest">
              <span>최근 이벤트</span>
              <strong>{latestEvent.title}</strong>
              <em>
                {getEventStatusLabel(latestEvent.status)} ·{" "}
                {formatDate(latestEvent.eventDate)} · 참가자{" "}
                {latestEvent._count.participants}명 · 팀{" "}
                {latestEvent._count.teams}개
              </em>
            </div>
          ) : (
            <div className="progress-overview-card__latest">
              <span>최근 이벤트</span>
              <strong>없음</strong>
              <em>등록된 이벤트 내전이 없습니다.</em>
            </div>
          )}
        </Link>

        <Link href="/progress/destruction" className="progress-overview-card">
          <div className="progress-overview-card__top">
            <span>DESTRUCTION MATCH</span>
            <strong>멸망전</strong>
          </div>

          <p>팀장, 예선 풀리그, 상위 4팀 토너먼트, 결승 진행 상태를 확인합니다.</p>

          <div className="progress-overview-card__stats">
            <div>
              <span>전체 멸망전</span>
              <strong>{totalDestructions}</strong>
            </div>

            <div>
              <span>완료 멸망전</span>
              <strong>{completedDestructions}</strong>
            </div>
          </div>

          {latestDestruction ? (
            <div className="progress-overview-card__latest">
              <span>최근 멸망전</span>
              <strong>{latestDestruction.title}</strong>
              <em>
                {getDestructionStatusLabel(latestDestruction.status)} ·{" "}
                {formatDate(latestDestruction.startDate)} · 참가자{" "}
                {latestDestruction._count.participants}명 · 팀{" "}
                {latestDestruction._count.teams}개
              </em>
            </div>
          ) : (
            <div className="progress-overview-card__latest">
              <span>최근 멸망전</span>
              <strong>없음</strong>
              <em>등록된 멸망전이 없습니다.</em>
            </div>
          )}
        </Link>
      </section>
    </main>
  );
}
