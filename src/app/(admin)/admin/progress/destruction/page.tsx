export const dynamic = "force-dynamic";


import Link from "next/link";
import DestructionTournamentDeleteButton from "@/components/admin/DestructionTournamentDeleteButton";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";

function formatDate(date: Date | null) {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getStatusLabel(status: string) {
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

type AdminDestructionTournamentsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;

export default async function AdminDestructionTournamentsPage({ searchParams }: AdminDestructionTournamentsPageProps) {
  const resolvedSearchParams = await searchParams;
  const requestedPage = parsePositivePage(resolvedSearchParams.page);
  const totalCount = await prisma.destructionTournament.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const tournaments = await prisma.destructionTournament.findMany({
    orderBy: {
      createdAt: "desc",
    },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      _count: {
        select: {
          teams: true,
          participants: true,
          matches: true,
        },
      },
    },
  });

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">멸망전 관리</h1>
          <p className="admin-page__description">
            멸망전 생성, 팀장 등록, 참가자 구성, 예선/토너먼트 결과를 관리합니다.
          </p>
        </div>

        <Link
          href="/admin/progress/destruction/new"
          className="admin-page__create-button"
        >
          멸망전 생성
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="empty-box">등록된 멸망전이 없습니다.</div>
      ) : (
        <div className="admin-event-list">
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="admin-event-card">
              <div className="admin-event-card__main">
                <div className="admin-event-card__top">
                  <span className="admin-event-card__status">
                    {getStatusLabel(tournament.status)}
                  </span>
                </div>

                <h2 className="admin-event-card__title">{tournament.title}</h2>

                <div className="admin-event-card__meta">
                  <span>시작일: {formatDate(tournament.startDate)}</span>
                  <span>종료일: {formatDate(tournament.endDate)}</span>
                </div>

                <div className="admin-event-card__counts">
                  <span>팀 {tournament._count.teams}개</span>
                  <span>참가자 {tournament._count.participants}명</span>
                  <span>경기 {tournament._count.matches}개</span>
                </div>
              </div>

              <div className="admin-event-card__actions">
                <Link
                  href={`/admin/progress/destruction/${tournament.id}`}
                  className="chip-button"
                >
                  상세/수정
                </Link>

                <DestructionTournamentDeleteButton
                  tournamentId={tournament.id}
                  title={tournament.title}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/admin/progress/destruction"
      />
    </main>
  );
}
