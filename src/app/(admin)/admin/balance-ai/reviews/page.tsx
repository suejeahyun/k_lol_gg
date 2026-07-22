export const dynamic = "force-dynamic";

import Link from "next/link";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";
import { prisma } from "@/lib/prisma/client";

type Props = { searchParams: Promise<{ page?: string; risk?: string }> };
const PAGE_SIZE = 20;

function fmt(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(1) : "-";
}

function riskClass(level: string | null | undefined) {
  if (level === "HIGH") return "ai-badge ai-badge--high";
  if (level === "MEDIUM") return "ai-badge ai-badge--medium";
  if (level === "LOW") return "ai-badge ai-badge--low";
  return "ai-badge";
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(value);
}

export default async function AdminBalanceAiReviewsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = parsePositivePage(sp.page);
  const risk = sp.risk?.trim();
  const where = risk ? { aiRiskLevel: risk } : {};

  const [totalCount, reviews, riskCounts] = await Promise.all([
    prisma.balanceMatchReview.count({ where }),
    prisma.balanceMatchReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        matchSeries: { select: { id: true, title: true, matchDate: true } },
        draft: { select: { id: true, title: true, optionType: true } },
      },
    }),
    Promise.all([
      prisma.balanceMatchReview.count(),
      prisma.balanceMatchReview.count({ where: { aiRiskLevel: "HIGH" } }),
      prisma.balanceMatchReview.count({ where: { aiRiskLevel: "MEDIUM" } }),
      prisma.balanceMatchReview.count({ where: { aiRiskLevel: "LOW" } }),
    ]),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const [allCount, highCount, mediumCount, lowCount] = riskCounts;

  return (
    <main className="page-container admin-page ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">AI REVIEW LOG</p>
          <h1 className="page-title">AI 밸런스 리뷰</h1>
          <p className="page-description">등록된 내전별 AI 판단, 예측 승률, 실제 결과, 실패 원인 후보를 확인합니다.</p>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>전체</span><strong>{allCount}</strong><small>AI 리뷰</small></article>
        <article className="ai-kpi"><span>HIGH</span><strong>{highCount}</strong><small>높은 위험</small></article>
        <article className="ai-kpi"><span>MEDIUM</span><strong>{mediumCount}</strong><small>주의 필요</small></article>
        <article className="ai-kpi"><span>LOW</span><strong>{lowCount}</strong><small>낮은 위험</small></article>
        <article className="ai-kpi"><span>현재 필터</span><strong>{risk ?? "ALL"}</strong><small>{totalCount}개 표시 대상</small></article>
      </section>

      <section className="ai-panel">
        <div className="ai-toolbar">
          <Link className="button-secondary" href="/admin/balance-ai/reviews">전체</Link>
          <Link className="button-secondary" href="/admin/balance-ai/reviews?risk=HIGH">HIGH</Link>
          <Link className="button-secondary" href="/admin/balance-ai/reviews?risk=MEDIUM">MEDIUM</Link>
          <Link className="button-secondary" href="/admin/balance-ai/reviews?risk=LOW">LOW</Link>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead>
              <tr><th>내전</th><th>위험도</th><th>품질</th><th>예상 승률</th><th>실제</th><th>AI 추론</th><th>드래프트</th><th></th></tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id}>
                  <td><Link href={`/admin/matches/${review.matchSeriesId}/ai-review`}>{review.matchSeries.title}</Link><br /><small>{formatDate(review.matchSeries.matchDate)}</small></td>
                  <td><span className={riskClass(review.aiRiskLevel)}>{review.aiRiskLevel ?? "-"}</span></td>
                  <td>{fmt(review.qualityScore)}</td>
                  <td>R {fmt(review.predictedRedWinRate)} / B {fmt(review.predictedBlueWinRate)}</td>
                  <td>{review.actualWinner ? <span className={review.actualWinner === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue"}>{review.actualWinner}</span> : "-"}</td>
                  <td>{review.aiInferredWinner ? <span className={review.aiInferredWinner === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue"}>{review.aiInferredWinner}</span> : "-"}</td>
                  <td>{review.draft ? <Link href={`/players/balance/drafts/${review.draft.id}`}>{review.draft.optionType ?? review.draft.title}</Link> : "-"}</td>
                  <td><Link href={`/admin/balance-ai/reviews/${review.id}`}>상세</Link></td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={8}>조건에 맞는 AI 리뷰가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/admin/balance-ai/reviews" query={risk ? { risk } : undefined} />
      </section>
    </main>
  );
}
