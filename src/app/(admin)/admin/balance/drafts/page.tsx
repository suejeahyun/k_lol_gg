export const dynamic = "force-dynamic";

import Link from "next/link";
import Pagination from "@/components/Pagination";
import { prisma } from "@/lib/prisma/client";

const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function formatDateOnly(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(value).replace(/\.\s?/g, "-").replace(/-$/, "");
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function getSeasonName(draftSeasonName: string | undefined, activeSeasonName: string | undefined) {
  if (draftSeasonName) return draftSeasonName;
  if (activeSeasonName) return `${activeSeasonName} · 자동`;
  return "시즌 미연동";
}

export default async function AdminTeamBalanceDraftsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const currentPage = Math.max(1, Number(sp.page ?? "1") || 1);
  const skip = (currentPage - 1) * PAGE_SIZE;

  const [totalCount, drafts, activeSeason] = await Promise.all([
    prisma.teamBalanceDraft.count(),
    prisma.teamBalanceDraft.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: PAGE_SIZE,
      include: {
        season: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            players: true,
            balanceReviews: true,
          },
        },
      },
    }),
    prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="page-container ai-page admin-balance-drafts-page">
      <section className="ai-hero ai-hero--compact">
        <div className="ai-hero__content">
          <p className="eyebrow">ADMIN · BALANCE ARCHIVE</p>
          <h1 className="page-title">AI 밸런스</h1>
        </div>
      </section>

      <section className="ai-kpi-grid ai-kpi-grid--compact">
        <article className="ai-kpi">
          <span>저장 밸런스</span>
          <strong>{totalCount}</strong>
          <small>전체 저장안</small>
        </article>
        <article className="ai-kpi">
          <span>현재 페이지</span>
          <strong>{currentPage}</strong>
          <small>전체 {totalPages}페이지</small>
        </article>
        <article className="ai-kpi">
          <span>페이지 표시</span>
          <strong>{drafts.length}</strong>
          <small>최신 저장순</small>
        </article>
        <article className="ai-kpi">
          <span>활성 시즌</span>
          <strong>{activeSeason?.name ?? "-"}</strong>
          <small>신규 저장 시 자동 연결</small>
        </article>
      </section>

      <section className="ai-panel ai-panel--strong admin-balance-drafts-panel">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">저장된 AI 밸런스 목록</h2>
          </div>
        </div>

        <div className="ai-table-wrap admin-balance-drafts-table-wrap">
          <table className="ai-table ai-table--wide admin-balance-drafts-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>이름</th>
                <th>시즌</th>
                <th>적용일</th>
                <th>RED</th>
                <th>BLUE</th>
                <th>차이</th>
                <th>인원</th>
                <th>AI 리뷰</th>
                <th>생성일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="ai-table-empty">
                    저장된 AI 밸런스가 없습니다.
                  </td>
                </tr>
              ) : (
                drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td><span className="ai-rank">#{draft.id}</span></td>
                    <td>
                      <Link className="ai-table-main-link" href={`/admin/balance/drafts/${draft.id}`}>
                        {draft.title}
                      </Link>
                    </td>
                    <td>{getSeasonName(draft.season?.name, activeSeason?.name)}</td>
                    <td>{formatDateOnly(draft.applyDate)}</td>
                    <td>{formatNumber(draft.redTotal)}</td>
                    <td>{formatNumber(draft.blueTotal)}</td>
                    <td>{formatNumber(draft.diff)}</td>
                    <td>{draft._count.players}명</td>
                    <td>{draft._count.balanceReviews}개</td>
                    <td>{formatDate(draft.createdAt)}</td>
                    <td>
                      <Link className="button button--sm" href={`/admin/balance/drafts/${draft.id}`}>
                        상세
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/admin/balance/drafts" />
      </section>
    </main>
  );
}
