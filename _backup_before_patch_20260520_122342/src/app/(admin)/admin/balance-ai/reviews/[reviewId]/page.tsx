export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type Props = { params: Promise<{ reviewId: string }> };

function fmt(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(1) : "-";
}

function lines(value: string | null | undefined) {
  return (value ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
}

function riskClass(level: string | null | undefined) {
  if (level === "HIGH") return "ai-badge ai-badge--high";
  if (level === "MEDIUM") return "ai-badge ai-badge--medium";
  if (level === "LOW") return "ai-badge ai-badge--low";
  return "ai-badge";
}

function deltaClass(value: number) {
  if (value > 0) return "ai-delta-positive";
  if (value < 0) return "ai-delta-negative";
  return "";
}

export default async function AdminBalanceAiReviewDetailPage({ params }: Props) {
  const { reviewId } = await params;
  const id = Number(reviewId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const review = await prisma.balanceMatchReview.findUnique({
    where: { id },
    include: {
      matchSeries: { include: { season: true } },
      draft: { select: { id: true, title: true, optionType: true } },
    },
  });
  if (!review) notFound();

  const results = await prisma.playerBalanceMatchResult.findMany({
    where: { matchSeriesId: review.matchSeriesId },
    orderBy: [{ gameId: "asc" }, { team: "asc" }, { position: "asc" }],
    include: { player: { select: { id: true, name: true, nickname: true, tag: true } } },
  });

  return (
    <main className="page-container admin-page ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">AI REVIEW DETAIL</p>
          <h1 className="page-title">{review.matchSeries.title}</h1>
          <p className="page-description">AI 예상과 실제 결과, 실패 원인 후보, 플레이어별 MMR 변화를 확인합니다.</p>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href={`/admin/matches/${review.matchSeriesId}/ai-review`}>내전 AI 리뷰</Link>
            {review.draft && <Link className="button-secondary" href={`/players/balance/drafts/${review.draft.id}`}>저장 밸런스</Link>}
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>위험도</span><strong><span className={riskClass(review.aiRiskLevel)}>{review.aiRiskLevel ?? "-"}</span></strong><small>AI 판단</small></article>
        <article className="ai-kpi"><span>품질</span><strong>{fmt(review.qualityScore)}</strong><small>높을수록 안정</small></article>
        <article className="ai-kpi"><span>예상 승률</span><strong>R {fmt(review.predictedRedWinRate)}</strong><small>B {fmt(review.predictedBlueWinRate)}</small></article>
        <article className="ai-kpi"><span>실제 승리</span><strong>{review.actualWinner ?? "-"}</strong><small>등록 결과</small></article>
        <article className="ai-kpi"><span>AI 추론</span><strong>{review.aiInferredWinner ?? "-"}</strong><small>예측 우세</small></article>
      </section>

      <section className="ai-grid-2">
        <article className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">AI 판단</h2>
              <p className="ai-panel__desc">실제 결과와 계산 당시 밸런스 지표를 종합한 추론입니다.</p>
            </div>
            <span className="ai-badge">{review.aiFormulaVersion ?? "v-"}</span>
          </div>
          <p className="ai-muted">{review.aiVerdict ?? "AI 판단 데이터가 없습니다."}</p>
        </article>

        <article className="ai-panel">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">핵심 지표</h2>
              <p className="ai-panel__desc">총점·라인·조합 위험을 빠르게 확인합니다.</p>
            </div>
          </div>
          <ul className="ai-list">
            <li>총점: RED {fmt(review.redTotal)} / BLUE {fmt(review.blueTotal)} / 차이 {fmt(review.diff)}</li>
            <li>최대 라인 차이: {fmt(review.maxLineDiff)}</li>
            <li>MID/JGL 차이: {fmt(review.midJglDiff)}</li>
            <li>BOT 차이: {fmt(review.bottomDiff)}</li>
            <li>AUTO {review.autoCount ?? 0}명 · 고티어 이탈 {review.highTierOffRoleCount ?? 0}명</li>
          </ul>
        </article>
      </section>

      <section className="ai-grid-2">
        <article className="ai-panel">
          <div className="ai-panel__head"><h2 className="ai-panel__title">판단 근거</h2></div>
          {lines(review.aiReasoning).length > 0 ? <ul className="ai-risk-list">{lines(review.aiReasoning).map((item, idx) => <li key={idx}>{item}</li>)}</ul> : <div className="ai-empty">판단 근거가 없습니다.</div>}
        </article>
        <article className="ai-panel">
          <div className="ai-panel__head"><h2 className="ai-panel__title">리스크 요인</h2></div>
          {lines(review.aiRiskFactors).length > 0 ? <ul className="ai-risk-list">{lines(review.aiRiskFactors).map((item, idx) => <li key={idx}>{item}</li>)}</ul> : <div className="ai-empty">리스크 요인이 없습니다.</div>}
        </article>
      </section>

      <section className="ai-panel">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">플레이어별 MMR 변화</h2>
            <p className="ai-panel__desc">등록된 KDA와 승패를 기준으로 반영된 내부 MMR 변화입니다.</p>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>팀</th><th>라인</th><th>플레이어</th><th>K/D/A</th><th>승</th><th>MMR</th><th>라인 MMR</th></tr></thead>
            <tbody>
              {results.map((item) => (
                <tr key={item.id}>
                  <td><span className={item.team === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue"}>{item.team}</span></td>
                  <td>{item.position}</td>
                  <td><Link href={`/admin/players/${item.playerId}/balance`}>{item.player.name}</Link><br /><small>{item.player.nickname}#{item.player.tag}</small></td>
                  <td>{item.kills}/{item.deaths}/{item.assists}</td>
                  <td>{item.win ? "승" : "패"}</td>
                  <td className={deltaClass(item.mmrDelta)}>{fmt(item.mmrDelta)}</td>
                  <td className={deltaClass(item.positionMmrDelta)}>{fmt(item.positionMmrDelta)}</td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan={7}>MMR 변화 데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
