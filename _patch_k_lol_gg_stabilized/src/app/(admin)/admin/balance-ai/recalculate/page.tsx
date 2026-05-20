export const dynamic = "force-dynamic";

import Link from "next/link";
import BalanceAiRecalculateClient from "@/components/admin/BalanceAiRecalculateClient";
import { prisma } from "@/lib/prisma/client";

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(value);
}

export default async function AdminBalanceAiRecalculatePage() {
  const [totalMatches, analyzedMatches, unanalyzedMatches, latestMatches] = await Promise.all([
    prisma.matchSeries.count(),
    prisma.matchSeries.count({ where: { balanceReviews: { some: {} } } }),
    prisma.matchSeries.count({ where: { balanceReviews: { none: {} } } }),
    prisma.matchSeries.findMany({
      orderBy: { matchDate: "desc" },
      take: 8,
      select: { id: true, title: true, matchDate: true, _count: { select: { balanceReviews: true } } },
    }),
  ]);

  return (
    <main className="page-container admin-page ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">AI MMR RECALCULATE</p>
          <h1 className="page-title">AI MMR 전체 재계산</h1>
          <p className="page-description">
            현재 등록된 모든 내전 기록을 다시 읽어 내부 MMR과 AI 리뷰를 재생성합니다.
            공식 변경, 테스트 데이터 정리, 기존 내전 백필이 필요할 때 사용합니다.
          </p>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>등록 내전</span><strong>{totalMatches}</strong><small>전체 대상</small></article>
        <article className="ai-kpi"><span>분석 완료</span><strong>{analyzedMatches}</strong><small>AI 리뷰 있음</small></article>
        <article className="ai-kpi"><span>미분석</span><strong>{unanalyzedMatches}</strong><small>AI 리뷰 없음</small></article>
        <article className="ai-kpi"><span>재계산 방식</span><strong>FULL</strong><small>기존 MMR 재생성</small></article>
        <article className="ai-kpi"><span>주의</span><strong>ADMIN</strong><small>운영 중 신중히 실행</small></article>
      </section>

      <section className="ai-grid-2">
        <BalanceAiRecalculateClient totalMatches={totalMatches} unanalyzedMatches={unanalyzedMatches} />
        <section className="ai-panel ai-danger">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">실행 전 확인</h2>
              <p className="ai-panel__desc">재계산은 기존 AI MMR 프로필과 AI 리뷰를 재생성합니다.</p>
            </div>
          </div>
          <ul className="ai-risk-list">
            <li>테스트 데이터가 섞여 있으면 MMR이 왜곡될 수 있습니다.</li>
            <li>경기 수정 직후에는 재분석 또는 전체 재계산을 실행해야 합니다.</li>
            <li>실행 중 새 내전 등록은 피하는 것이 좋습니다.</li>
          </ul>
        </section>
      </section>

      <section className="ai-panel" style={{ marginTop: 18 }}>
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">최근 등록 내전 분석 상태</h2>
            <p className="ai-panel__desc">현재 등록된 내전이 AI 리뷰와 연결되어 있는지 확인합니다.</p>
          </div>
          <Link className="button-secondary" href="/admin/matches">내전 목록</Link>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>내전</th><th>날짜</th><th>AI 리뷰</th><th></th></tr></thead>
            <tbody>
              {latestMatches.map((match) => (
                <tr key={match.id}>
                  <td>{match.title}</td>
                  <td>{formatDate(match.matchDate)}</td>
                  <td>{match._count.balanceReviews > 0 ? <span className="ai-badge ai-badge--low">완료</span> : <span className="ai-badge ai-badge--medium">필요</span>}</td>
                  <td><Link href={`/admin/matches/${match.id}/ai-review`}>AI 리뷰</Link></td>
                </tr>
              ))}
              {latestMatches.length === 0 && <tr><td colSpan={4}>등록된 내전이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
