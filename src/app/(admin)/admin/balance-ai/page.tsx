export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

function fmt(value: number | null | undefined, digits = 1) {
  return typeof value === "number" ? value.toFixed(digits) : "-";
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

export default async function AdminBalanceAiPage() {
  const [
    reviewCount,
    profileCount,
    totalMatches,
    unanalyzedMatches,
    latestReviews,
    topProfiles,
    pendingMatches,
    recent,
  ] = await Promise.all([
    prisma.balanceMatchReview.count(),
    prisma.playerBalanceProfile.count(),
    prisma.matchSeries.count(),
    prisma.matchSeries.count({ where: { balanceReviews: { none: {} } } }),
    prisma.balanceMatchReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { matchSeries: { select: { id: true, title: true, matchDate: true } } },
    }),
    prisma.playerBalanceProfile.findMany({
      orderBy: { overallMmr: "desc" },
      take: 8,
      include: { player: { select: { id: true, name: true, nickname: true, tag: true } } },
    }),
    prisma.matchSeries.findMany({
      where: { balanceReviews: { none: {} } },
      orderBy: { matchDate: "desc" },
      take: 6,
      select: { id: true, title: true, matchDate: true },
    }),
    prisma.balanceMatchReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { actualWinner: true, aiInferredWinner: true },
    }),
  ]);

  const predicted = recent.filter((item) => item.actualWinner && item.aiInferredWinner);
  const hitRate = predicted.length
    ? (predicted.filter((item) => item.actualWinner === item.aiInferredWinner).length / predicted.length) * 100
    : null;

  return (
    <main className="page-container admin-page ai-page ai-page--admin-dashboard">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">K-LOL RANKING CONTROL</p>
          <h1 className="page-title">K-LOL 랭킹 대시보드</h1>
          <div className="ai-hero__actions">
            <Link className="button-primary" href="/admin/balance-ai/reviews">랭킹 리뷰 보기</Link>
            <Link className="button-secondary" href="/admin/balance-ai/players">플레이어 랭킹</Link>
            <Link className="button-secondary" href="/admin/balance-ai/recalculate">등록 내전 재계산</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid" aria-label="K-LOL 랭킹 요약">
        <article className="ai-kpi"><span>등록 내전</span><strong>{totalMatches}</strong><small>전체 MatchSeries</small></article>
        <article className="ai-kpi"><span>랭킹 리뷰</span><strong>{reviewCount}</strong><small>분석 완료 리뷰</small></article>
        <article className="ai-kpi"><span>미분석</span><strong>{unanalyzedMatches}</strong><small>재계산 대상</small></article>
        <article className="ai-kpi"><span>예측 적중률</span><strong>{hitRate === null ? "-" : `${fmt(hitRate)}%`}</strong><small>최근 리뷰 기준</small></article>

      </section>

      <section className="ai-grid-2">
        <article className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">플레이어 랭킹 프로필</h2>
              <p className="ai-panel__desc">경기 결과로 학습된 K-LOL 랭킹 기준 플레이어 수입니다.</p>
            </div>
            <strong className="ai-badge">{profileCount}명</strong>
          </div>
          <div className="ai-actions">
            <Link className="button-secondary" href="/admin/balance-ai/players">라인별 랭킹 확인</Link>
          </div>
        </article>

        <article className={unanalyzedMatches > 0 ? "ai-panel ai-warning" : "ai-panel ai-panel--strong"}>
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">기존 등록 내전 분석</h2>
              <p className="ai-panel__desc">기존에 등록된 내전이 K-LOL 랭킹 리뷰에 반영됐는지 확인합니다.</p>
            </div>
            <span className={unanalyzedMatches > 0 ? "ai-badge ai-badge--medium" : "ai-badge ai-badge--low"}>
              {unanalyzedMatches > 0 ? "분석 필요" : "정상"}
            </span>
          </div>
          <div className="ai-actions">
            <Link className="button-primary" href="/admin/balance-ai/recalculate">전체 재계산</Link>
          </div>
        </article>
      </section>

      {pendingMatches.length > 0 && (
        <section className="ai-panel ai-warning" style={{ marginTop: 18 }}>
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">랭킹 리뷰가 없는 기존 내전</h2>
              <p className="ai-panel__desc">아래 내전은 현재 등록되어 있지만 랭킹 리뷰가 없습니다. 전체 재계산 또는 개별 리뷰에서 재분석하세요.</p>
            </div>
            <Link className="button-primary" href="/admin/balance-ai/recalculate">재계산 페이지</Link>
          </div>
          <ul className="ai-list">
            {pendingMatches.map((match) => (
              <li key={match.id}>
                <Link href={`/admin/matches/${match.id}/ai-review`}>{match.title}</Link>
                <span className="ai-muted"> · {formatDate(match.matchDate)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ai-grid-2">
        <section className="ai-panel">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">최근 랭킹 리뷰</h2>
              <p className="ai-panel__desc">실제 경기 결과와 K-LOL 랭킹 판단이 저장된 최신 리뷰입니다.</p>
            </div>
            <Link className="button-secondary" href="/admin/balance-ai/reviews">전체</Link>
          </div>
          <div className="ai-table-wrap">
            <table className="ai-table">
              <thead><tr><th>내전</th><th>예상</th><th></th></tr></thead>
              <tbody>
                {latestReviews.map((review) => (
                  <tr key={review.id}>
                    <td><Link href={`/admin/matches/${review.matchSeriesId}/ai-review`}>{review.matchSeries.title}</Link><br /><small>{formatDate(review.matchSeries.matchDate)}</small></td>
                    <td>R {fmt(review.predictedRedWinRate)} / B {fmt(review.predictedBlueWinRate)}</td>
                    <td><Link href={`/admin/balance-ai/reviews/${review.id}`}>상세</Link></td>
                  </tr>
                ))}
                {latestReviews.length === 0 && <tr><td colSpan={5}>랭킹 리뷰가 없습니다. 기존 내전을 재계산하면 리뷰가 생성됩니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">K-LOL 랭킹 상위</h2>
              <p className="ai-panel__desc">현재 랭킹 모델이 강하게 평가하는 플레이어입니다.</p>
            </div>
            <Link className="button-secondary" href="/admin/balance-ai/players">전체</Link>
          </div>
          <div className="ai-table-wrap">
            <table className="ai-table">
              <thead><tr><th>플레이어</th><th>전체</th><th>신뢰도</th><th></th></tr></thead>
              <tbody>
                {topProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td><span className="ai-player-name"><strong>{profile.player.name}</strong><small>{profile.player.nickname}#{profile.player.tag}</small></span></td>
                    <td>{fmt(profile.overallMmr)}</td>
                    <td>{fmt(profile.confidence * 100)}%</td>
                    <td><Link href={`/admin/players/${profile.playerId}/balance`}>상세</Link></td>
                  </tr>
                ))}
                {topProfiles.length === 0 && <tr><td colSpan={4}>랭킹 프로필이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
