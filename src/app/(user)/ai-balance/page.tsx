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
    officialDrafts,
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
    prisma.teamBalanceDraft.findMany({
      where: { isOfficial: true },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        applyDate: true,
        formulaVersion: true,
        redTotal: true,
        blueTotal: true,
        diff: true,
        balanceCost: true,
        _count: { select: { players: true } },
      },
    }),
    prisma.playerBalanceProfile.findMany({
      orderBy: { overallMmr: "desc" },
      take: 5,
      select: {
        id: true,
        overallMmr: true,
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
    <main className="page-container ai-page ai-page--public">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">PUBLIC AI BALANCE</p>
          <h1 className="page-title">AI 밸런스 센터</h1>
          <p className="page-description">
            내전 기록을 기반으로 팀 밸런스 품질, 공개 MMR, 공식 팀밸런스 결과를 확인하는 유저용 화면입니다.
            재계산, 관리자 메모, 백업, 권한 처리는 관리자 페이지에서만 관리됩니다.
          </p>
          <div className="ai-hero__actions">
            <Link className="button-primary" href="/players/balance">팀 밸런스 계산</Link>
            <Link className="button-secondary" href="/ai-balance/players">AI MMR 보기</Link>
            <Link className="button-secondary" href="/rankings">공식 랭킹</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid" aria-label="AI 공개 요약">
        <article className="ai-kpi"><span>AI 리뷰</span><strong>{reviewCount}</strong><small>분석된 내전 수</small></article>
        <article className="ai-kpi"><span>공개 MMR</span><strong>{profileCount}</strong><small>프로필 생성 플레이어</small></article>
        <article className="ai-kpi"><span>예측 적중률</span><strong>{hitRate === null ? "-" : `${fmt(hitRate)}%`}</strong><small>최근 50개 리뷰 기준</small></article>
        <article className="ai-kpi"><span>평균 품질</span><strong>{fmt(avgQuality)}</strong><small>밸런스 품질 점수</small></article>
        <article className="ai-kpi"><span>공식 밸런스</span><strong>{officialDrafts.length}</strong><small>최근 저장 결과</small></article>
      </section>

      <section className="ai-grid-3">
        <article className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">공개 범위</h2>
              <p className="ai-panel__desc">유저 페이지에서는 운영상 안전한 요약 데이터만 표시합니다.</p>
            </div>
          </div>
          <ul className="ai-list">
            <li>표시: 품질 점수, 위험도, 공개 MMR, 공식 밸런스 결과</li>
            <li>비공개: 관리자 메모, 재계산 버튼, 백업 CSV, 상세 피드백</li>
            <li>목적: 팀 구성에 대한 납득도와 투명성 확보</li>
          </ul>
        </article>

        <article className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">위험도 분포</h2>
              <p className="ai-panel__desc">AI가 판단한 최근 내전 밸런스 리스크입니다.</p>
            </div>
          </div>
          <ul className="ai-list">
            <li><span className="ai-badge ai-badge--high">HIGH</span> {highRiskCount}개</li>
            <li><span className="ai-badge ai-badge--medium">MEDIUM</span> {mediumRiskCount}개</li>
            <li><span className="ai-badge ai-badge--low">LOW</span> {lowRiskCount}개</li>
          </ul>
        </article>

        <article className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">AI 점수 해석</h2>
              <p className="ai-panel__desc">점수는 승패 예측이 아니라 팀 균형을 판단하기 위한 보조 지표입니다.</p>
            </div>
          </div>
          <ul className="ai-list">
            <li>품질 점수 높음: 라인/총점/자동배정 차이가 작음</li>
            <li>위험도 높음: 특정 라인 또는 고티어 오프롤 차이가 큼</li>
            <li>MMR 신뢰도는 분석 경기 수가 많을수록 안정화</li>
          </ul>
        </article>
      </section>

      <section className="ai-grid-2">
        <section className="ai-panel">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">최근 AI 리뷰</h2>
              <p className="ai-panel__desc">공개 가능한 요약만 표시합니다.</p>
            </div>
          </div>
          <div className="ai-table-wrap">
            <table className="ai-table">
              <thead><tr><th>내전</th><th>위험</th><th>품질</th><th>예상</th></tr></thead>
              <tbody>
                {latestReviews.map((review) => (
                  <tr key={review.id}>
                    <td><Link href={`/matches/${review.matchSeries.id}`}>{review.matchSeries.title}</Link><br /><small>{formatDate(review.matchSeries.matchDate)}</small></td>
                    <td><span className={riskClass(review.aiRiskLevel)}>{review.aiRiskLevel ?? "-"}</span></td>
                    <td>{fmt(review.qualityScore)}</td>
                    <td>RED {fmt(review.predictedRedWinRate)}% / BLUE {fmt(review.predictedBlueWinRate)}%</td>
                  </tr>
                ))}
                {latestReviews.length === 0 && <tr><td colSpan={4}>아직 공개 가능한 AI 리뷰가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">AI MMR 상위</h2>
              <p className="ai-panel__desc">내전 기록 기반 공개 MMR 요약입니다.</p>
            </div>
            <Link className="button-secondary" href="/ai-balance/players">전체 보기</Link>
          </div>
          <div className="ai-table-wrap">
            <table className="ai-table">
              <thead><tr><th>플레이어</th><th>MMR</th><th>신뢰도</th><th>분석</th></tr></thead>
              <tbody>
                {topProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td><Link href={`/players/${profile.player.id}`}>{profile.player.name}</Link><br /><small>{profile.player.nickname}#{profile.player.tag}</small></td>
                    <td>{fmt(profile.overallMmr)}</td>
                    <td>{fmt(profile.confidence * 100)}%</td>
                    <td>{profile.matchesAnalyzed}경기</td>
                  </tr>
                ))}
                {topProfiles.length === 0 && <tr><td colSpan={4}>AI MMR 프로필이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="ai-panel" style={{ marginTop: 18 }}>
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">최근 공식 팀밸런스</h2>
            <p className="ai-panel__desc">팀밸런스 계산 후 공식 저장된 결과입니다.</p>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>제목</th><th>적용일</th><th>인원</th><th>버전</th><th>RED/BLUE</th><th>차이</th></tr></thead>
            <tbody>
              {officialDrafts.map((draft) => (
                <tr key={draft.id}>
                  <td>{draft.title}</td>
                  <td>{formatDate(draft.applyDate)}</td>
                  <td>{draft._count.players}명</td>
                  <td>{draft.formulaVersion ?? "-"}</td>
                  <td>{fmt(draft.redTotal)} / {fmt(draft.blueTotal)}</td>
                  <td>{fmt(draft.diff ?? draft.balanceCost)}</td>
                </tr>
              ))}
              {officialDrafts.length === 0 && <tr><td colSpan={6}>공식 저장된 팀밸런스 결과가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
