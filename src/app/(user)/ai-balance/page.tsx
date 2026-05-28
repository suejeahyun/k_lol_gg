export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

function fmt(value: number | null | undefined, digits = 1) {
  return typeof value === "number" ? value.toFixed(digits) : "-";
}

function riskClass(level: string | null | undefined) {
  if (level === "HIGH") return "ai-badge ai-badge--high";
  if (level === "MEDIUM") return "ai-badge ai-badge--medium";
  if (level === "LOW") return "ai-badge ai-badge--low";
  return "ai-badge";
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
  const [
    reviewCount,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    profileCount,
    latestReviews,
    topProfiles,
    recent,
  ] = await Promise.all([
    prisma.balanceMatchReview.count(),
    prisma.balanceMatchReview.count({ where: { aiRiskLevel: "HIGH" } }),
    prisma.balanceMatchReview.count({ where: { aiRiskLevel: "MEDIUM" } }),
    prisma.balanceMatchReview.count({ where: { aiRiskLevel: "LOW" } }),
    prisma.playerBalanceProfile.count(),
    prisma.balanceMatchReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        aiRiskLevel: true,
        qualityScore: true,
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
      select: { actualWinner: true, aiInferredWinner: true, qualityScore: true },
    }),
  ]);

  const predicted = recent.filter((item) => item.actualWinner && item.aiInferredWinner);
  const hitRate = predicted.length
    ? (predicted.filter((item) => item.actualWinner === item.aiInferredWinner).length / predicted.length) * 100
    : null;
  const avgQuality = recent.length
    ? recent.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / recent.length
    : null;

  return (
    <main className="page-container ai-page ai-page--public ai-page--mmr">
      <section className="ai-hero ai-hero--compact">
        <div className="ai-hero__content">
          <p className="eyebrow">K-LOL MMR</p>
          <h1 className="page-title">K-LOL MMR</h1>
        </div>
      </section>

      <section className="ai-kpi-grid ai-kpi-grid--mmr-summary" aria-label="K-LOL MMR 요약">
        <article className="ai-kpi"><span>AI 리뷰</span><strong>{reviewCount}</strong><small>분석된 내전</small></article>
        <article className="ai-kpi"><span>공개 MMR</span><strong>{profileCount}</strong><small>프로필 생성</small></article>
        <article className="ai-kpi"><span>예측 적중률</span><strong>{hitRate === null ? "-" : `${fmt(hitRate)}%`}</strong><small>최근 50개 기준</small></article>
        <article className="ai-kpi"><span>평균 품질</span><strong>{fmt(avgQuality)}</strong><small>밸런스 점수</small></article>
        <article className="ai-kpi ai-kpi--risk">
          <span>위험도 분포</span>
          <div className="ai-risk-inline" aria-label="위험도 분포">
            <b className="ai-risk-inline__high">H {highRiskCount}</b>
            <b className="ai-risk-inline__medium">M {mediumRiskCount}</b>
            <b className="ai-risk-inline__low">L {lowRiskCount}</b>
          </div>
          <small>HIGH / MEDIUM / LOW</small>
        </article>
      </section>

      <section className="ai-panel ai-panel--ranking">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">K-LOL MMR 랭킹</h2>
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
              {topProfiles.length === 0 && <tr><td colSpan={10}>K-LOL MMR 프로필이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ai-panel">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">최근 AI 리뷰</h2>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>내전</th><th>위험</th><th>품질</th><th>예상</th><th>결과</th></tr></thead>
            <tbody>
              {latestReviews.map((review) => (
                <tr key={review.id}>
                  <td><Link href={`/matches/${review.matchSeries.id}`}>{review.matchSeries.title}</Link><br /><small>{formatDate(review.matchSeries.matchDate)}</small></td>
                  <td><span className={riskClass(review.aiRiskLevel)}>{review.aiRiskLevel ?? "-"}</span></td>
                  <td>{fmt(review.qualityScore)}</td>
                  <td>RED {fmt(review.predictedRedWinRate)}% / BLUE {fmt(review.predictedBlueWinRate)}%</td>
                  <td>{review.actualWinner ? `${review.actualWinner} 승` : "-"}</td>
                </tr>
              ))}
              {latestReviews.length === 0 && <tr><td colSpan={5}>최근 AI 리뷰가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
