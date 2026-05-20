export const dynamic = "force-dynamic";

import Link from "next/link";
import Pagination from "@/components/Pagination";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";

type Props = { searchParams: Promise<{ page?: string }> };
const PAGE_SIZE = 12;

function fmt(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(1) : "-";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(value);
}

function riskClass(level: string | null | undefined) {
  if (level === "HIGH") return "ai-badge ai-badge--high";
  if (level === "MEDIUM") return "ai-badge ai-badge--medium";
  if (level === "LOW") return "ai-badge ai-badge--low";
  return "ai-badge";
}

export default async function BalanceDraftsPage({ searchParams }: Props) {
  await requireApprovedUserOrAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const [totalCount, drafts, latestReviewCount] = await Promise.all([
    prisma.teamBalanceDraft.count(),
    prisma.teamBalanceDraft.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { players: true } },
        balanceReviews: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.balanceMatchReview.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="page-container ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">TEAM BALANCE DRAFTS</p>
          <h1 className="page-title">저장된 팀 밸런스</h1>
          <p className="page-description">최근 저장한 팀 밸런스 결과, 총점, AI 판단, 위험도를 다시 확인합니다.</p>
          <div className="ai-hero__actions">
            <Link className="button-primary" href="/players/balance">새 팀 밸런스 계산</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>저장 결과</span><strong>{totalCount}</strong><small>TeamBalanceDraft</small></article>
        <article className="ai-kpi"><span>AI 리뷰</span><strong>{latestReviewCount}</strong><small>연결 가능 리뷰</small></article>
        <article className="ai-kpi"><span>현재 페이지</span><strong>{page}</strong><small>전체 {totalPages}페이지</small></article>
        <article className="ai-kpi"><span>표시</span><strong>{drafts.length}</strong><small>현재 목록</small></article>
        <article className="ai-kpi"><span>흐름</span><strong>계산</strong><small>저장 후 내전 등록</small></article>
      </section>

      <section className="ai-draft-grid">
        {drafts.map((draft) => {
          const review = draft.balanceReviews[0];
          return (
            <article className="ai-panel ai-draft-card" key={draft.id}>
              <div className="ai-panel__head">
                <div>
                  <h2 className="ai-panel__title">{draft.title}</h2>
                  <p className="ai-panel__desc">{formatDate(draft.createdAt)}</p>
                </div>
                <span className={riskClass(review?.aiRiskLevel)}>{review?.aiRiskLevel ?? "NO AI"}</span>
              </div>
              <div className="ai-draft-card__meta">
                <span>선택안: {draft.optionType ?? "-"}</span>
                <span>RED {fmt(draft.redTotal)} / BLUE {fmt(draft.blueTotal)}</span>
                <span>점수 차이 {fmt(draft.diff)} · 밸런스 비용 {fmt(draft.balanceCost)}</span>
                <span>AI 품질 {fmt(review?.qualityScore)} · 플레이어 {draft._count.players}명</span>
              </div>
              <div className="ai-actions" style={{ marginTop: "auto" }}>
                <Link className="button-primary" href={`/players/balance/drafts/${draft.id}`}>상세 보기</Link>
              </div>
            </article>
          );
        })}
        {drafts.length === 0 && <article className="ai-panel ai-empty">저장된 팀 밸런스가 없습니다. 팀 밸런스 계산 후 저장하면 이곳에서 다시 확인할 수 있습니다.</article>}
      </section>
      <Pagination currentPage={page} totalPages={totalPages} basePath="/players/balance/drafts" />
    </main>
  );
}
