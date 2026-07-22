export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";

export const metadata: Metadata = {
  title: "K-LOL MMR",
  description: "K-LOL.GG의 내전 MMR, 밸런스 분석과 최근 예측 결과를 확인하세요.",
};

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

export default async function UserAiBalancePage() {
  const siteSettings = await getSiteSettings();
  const [
    reviewCount,
    profileCount,
    latestReviews,
    topProfiles,
    recent,
  ] = await Promise.all([
    prisma.balanceMatchReview.count(),
    prisma.playerBalanceProfile.count(),
    prisma.balanceMatchReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        predictedRedWinRate: true,
        predictedBlueWinRate: true,
        actualWinner: true,
        aiInferredWinner: true,
        matchSeries: { select: { id: true, title: true, matchDate: true } },
      },
    }),
    prisma.playerBalanceProfile.findMany({
      orderBy: [{ overallMmr: "desc" }, { confidence: "desc" }],
      take: 12,
      select: {
        id: true,
        overallMmr: true,
        topMmr: true,
        jungleMmr: true,
        midMmr: true,
        adcMmr: true,
        supportMmr: true,
        confidence: true,
        matchesAnalyzed: true,
        player: { select: { id: true, name: true, nickname: true, tag: true } },
      },
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
    <PremiumFeatureGate feature="balanceAi" settings={siteSettings}>
    <main className="page-container ai-page ai-page--public ai-page--ranking">
      <section className="ai-hero ai-hero--compact">
        <div className="ai-hero__content">
          <p className="eyebrow">K-LOL RANKING</p>
          <h1 className="page-title">K-LOL 랭킹</h1>
        </div>
      </section>

      <section className="ai-kpi-grid ai-kpi-grid--mmr-summary" aria-label="K-LOL 랭킹 요약">
        <article className="ai-kpi"><span>랭킹 리뷰</span><strong>{reviewCount}</strong><small>분석된 내전</small></article>
        <article className="ai-kpi"><span>랭킹 프로필</span><strong>{profileCount}</strong><small>프로필 생성</small></article>
        <article className="ai-kpi"><span>예측 적중률</span><strong>{hitRate === null ? "-" : `${fmt(hitRate)}%`}</strong><small>최근 50개 기준</small></article>
        <article className="ai-kpi ai-kpi--status">
          <span>최근 업데이트</span>
          <strong>{latestReviews[0]?.matchSeries.title ?? "-"}</strong>
          <small>{latestReviews[0] ? formatDate(latestReviews[0].matchSeries.matchDate) : "분석 기록 없음"}</small>
        </article>
      </section>

      <section className="ai-panel ai-panel--ranking">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">K-LOL 랭킹 보드</h2>
          </div>
          <div className="ai-panel__meta">
            <span>상위 {topProfiles.length}명</span>
            <span>신뢰도 · 라인별 MMR 기준</span>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table ai-table--wide">
            <thead>
              <tr>
                <th>순위</th>
                <th>플레이어</th>
                <th>전체</th>
                <th>TOP</th>
                <th>JGL</th>
                <th>MID</th>
                <th>ADC</th>
                <th>SUP</th>
                <th>신뢰도</th>
                <th>분석 경기</th>
              </tr>
            </thead>
            <tbody>
              {topProfiles.map((profile, index) => (
                <tr key={profile.id}>
                  <td><span className="ai-rank">#{index + 1}</span></td>
                  <td>
                    <Link className="ai-player-name" href={`/players/${profile.player.id}`}>
                      <strong>{profile.player.name}</strong>
                      <small>{profile.player.nickname}#{profile.player.tag}</small>
                    </Link>
                  </td>
                  <td><strong>{fmt(profile.overallMmr)}</strong></td>
                  <td>{fmt(profile.topMmr)}</td>
                  <td>{fmt(profile.jungleMmr)}</td>
                  <td>{fmt(profile.midMmr)}</td>
                  <td>{fmt(profile.adcMmr)}</td>
                  <td>{fmt(profile.supportMmr)}</td>
                  <td>{fmt(profile.confidence * 100)}%</td>
                  <td>{profile.matchesAnalyzed}</td>
                </tr>
              ))}
              {topProfiles.length === 0 && <tr><td colSpan={10}>K-LOL 랭킹 프로필이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ai-panel">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">최근 랭킹 리뷰</h2>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>내전</th><th>예상</th><th>결과</th></tr></thead>
            <tbody>
              {latestReviews.map((review) => (
                <tr key={review.id}>
                  <td><Link href={`/matches/${review.matchSeries.id}`}>{review.matchSeries.title}</Link><br /><small>{formatDate(review.matchSeries.matchDate)}</small></td>
                  <td>RED {fmt(review.predictedRedWinRate)}% / BLUE {fmt(review.predictedBlueWinRate)}%</td>
                  <td>{review.actualWinner ? `${review.actualWinner} 승` : "-"}</td>
                </tr>
              ))}
              {latestReviews.length === 0 && <tr><td colSpan={3}>최근 랭킹 리뷰가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    </PremiumFeatureGate>
  );
}
