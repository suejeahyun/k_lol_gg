export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import TierIcon from "@/components/TierIcon";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "신청",
  CONFIRMED: "확정",
  RESERVE: "보류",
  CANCELLED: "취소",
  REJECTED: "제외",
};

function formatPositions(positions: string[] | null | undefined) {
  if (!positions || positions.length === 0) return "-";
  return positions.join(" / ");
}

function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function DestructionParticipantsPage({ params }: PageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      participationApplies: {
        where: {
          status: {
            in: ["APPLIED", "CONFIRMED", "RESERVE"],
          },
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              nickname: true,
              tag: true,
              currentTier: true,
              peakTier: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!tournament) {
    notFound();
  }

  const applies = tournament.participationApplies;
  const activeApplies = applies.filter((apply) => apply.status !== "RESERVE");
  const reserveApplies = applies.filter((apply) => apply.status === "RESERVE");
  const captainPreferredCount = activeApplies.filter((apply) => apply.isCaptain).length;
  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: activeApplies.filter((apply) => apply.mainPosition === position).length,
  }));

  return (
    <main className="page-shell player-detail-page">
      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">멸망전 참가자 명단</p>
          <h1 className="page-title">{tournament.title}</h1>
          <p className="page-description">
            공개 대상은 신청/확정/보류 상태의 참가자입니다. 각 참가자를 누르면 상세정보로 이동합니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href={`/participation/destruction/${tournament.id}`} className="btn btn-ghost">
            참가 페이지
          </Link>
          <Link href="/participation" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="content-section player-panel">
        <div className="card-grid player-stat-grid">
          <article className="stat-card">
            <span className="stat-card__label">확정 후보</span>
            <strong className="stat-card__value">{activeApplies.length}명</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">보류</span>
            <strong className="stat-card__value">{reserveApplies.length}명</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">팀장 선호</span>
            <strong className="stat-card__value">{captainPreferredCount}명</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">총 공개 인원</span>
            <strong className="stat-card__value">{applies.length}명</strong>
          </article>
        </div>
      </section>

      <section className="content-section player-panel">
        <div className="section-header">
          <h2>라인별 현황</h2>
        </div>
        <div className="admin-event-detail-grid">
          {positionCounts.map((item) => (
            <div key={item.position} className="admin-event-detail-card">
              <span>{item.position}</span>
              <strong>{item.count}명</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>참가자 목록</h2>
            <p className="section-subtitle">이름, 닉네임, 티어, 포지션, 각오를 공개합니다.</p>
          </div>
        </div>

        {applies.length === 0 ? (
          <div className="empty-box">공개할 참가자가 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {applies.map((apply, index) => (
              <Link
                key={apply.id}
                href={`/participation/destruction/${tournament.id}/participants/${apply.playerId}`}
                className="match-card"
                style={{ textDecoration: "none" }}
              >
                <div className="match-card__top">
                  <div>
                    <strong className="match-card__queue">
                      {index + 1}. {apply.player.name} ({apply.player.nickname}#{apply.player.tag})
                    </strong>
                    <p className="match-card__date">
                      신청일: {formatDateTime(apply.createdAt)}
                    </p>
                  </div>
                  <div className="match-card__result">
                    <span>{STATUS_LABELS[apply.status] ?? apply.status}</span>
                    <span>{apply.isCaptain ? "팀장 선호" : "팀장 비선호"}</span>
                  </div>
                </div>
                <div className="match-card__body">
                  <div className="match-card__champion">
                    <strong>주 {apply.mainPosition}</strong>
                    <span>부 {formatPositions(apply.subPositions)}</span>
                  </div>
                  <div className="match-card__score">
                    <TierIcon tier={apply.player.currentTier} size={24} showText />
                    <span>최고 {apply.player.peakTier ?? "-"}</span>
                  </div>
                  <div className="match-card__damage">
                    <span>{apply.message?.trim() ? `각오: ${apply.message.trim()}` : "각오 미입력"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
