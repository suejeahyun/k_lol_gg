export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import MatchAiReanalyzeButton from "@/components/admin/MatchAiReanalyzeButton";
import BalanceFeedbackForm from "@/components/admin/BalanceFeedbackForm";
import { prisma } from "@/lib/prisma/client";

type Props = { params: Promise<{ matchId: string }> };

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

export default async function AdminMatchAiReviewPage({ params }: Props) {
  const { matchId } = await params;
  const id = Number(matchId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const match = await prisma.matchSeries.findUnique({
    where: { id },
    include: {
      season: true,
      teamBalanceDraft: { select: { id: true, title: true } },
      games: { include: { participants: true } },
    },
  });
  if (!match) notFound();

  const reviews = await prisma.balanceMatchReview.findMany({ where: { matchSeriesId: id }, orderBy: { createdAt: "desc" } });
  const results = await prisma.playerBalanceMatchResult.findMany({
    where: { matchSeriesId: id },
    orderBy: [{ gameId: "asc" }, { team: "asc" }, { position: "asc" }],
    include: { player: true },
  });
  const review = reviews[0] ?? null;

  return (
    <main className="page-container admin-page ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">MATCH AI REVIEW</p>
          <h1 className="page-title">{match.title}</h1>
          <p className="page-description">
            등록된 내전 결과를 기준으로 AI 예상, 실제 승리팀, 실패 원인, 플레이어별 MMR 변화를 확인합니다.
          </p>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href={`/admin/matches/${id}/edit`}>내전 수정</Link>
            {match.teamBalanceDraft ? (
              <Link className="button-secondary" href={`/admin/balance/drafts/${match.teamBalanceDraft.id}`}>
                연결 밸런스 #{match.teamBalanceDraft.id}
              </Link>
            ) : null}
            <Link className="button-secondary" href="/admin/balance-ai/reviews">AI 리뷰 목록</Link>
          </div>
        </div>
      </section>

      {review ? (
        <>
          <section className="ai-kpi-grid">
            <article className="ai-kpi"><span>위험도</span><strong><span className={riskClass(review.aiRiskLevel)}>{review.aiRiskLevel ?? "-"}</span></strong><small>AI 판단</small></article>
            <article className="ai-kpi"><span>품질</span><strong>{fmt(review.qualityScore)}</strong><small>추천 안정성</small></article>
            <article className="ai-kpi"><span>예상 승률</span><strong>R {fmt(review.predictedRedWinRate)}</strong><small>B {fmt(review.predictedBlueWinRate)}</small></article>
            <article className="ai-kpi"><span>실제 승리</span><strong>{review.actualWinner ?? "-"}</strong><small>등록 결과</small></article>
            <article className="ai-kpi"><span>AI 추론</span><strong>{review.aiInferredWinner ?? "-"}</strong><small>예상 우세</small></article>
          </section>

          <section className="ai-grid-2">
            <article className="ai-panel ai-panel--strong">
              <div className="ai-panel__head">
                <div>
                  <h2 className="ai-panel__title">AI 판단</h2>
                  <p className="ai-panel__desc">현재 등록된 결과와 계산 당시 지표를 비교한 판단입니다.</p>
                </div>
                <Link href={`/admin/balance-ai/reviews/${review.id}`} className="button-secondary">상세 리뷰</Link>
              </div>
              <p className="ai-muted">{review.aiVerdict ?? "AI 판단 데이터가 없습니다."}</p>
              {lines(review.aiRiskFactors).length > 0 && <ul className="ai-risk-list">{lines(review.aiRiskFactors).map((item, idx) => <li key={idx}>{item}</li>)}</ul>}
            </article>

            <article className="ai-panel">
              <div className="ai-panel__head">
                <div>
                  <h2 className="ai-panel__title">현재 내전 재분석</h2>
                  <p className="ai-panel__desc">내전 결과를 수정했거나 AI 리뷰가 의심될 때 이 경기만 다시 분석합니다.</p>
                </div>
              </div>
              <MatchAiReanalyzeButton matchId={id} />
            </article>
          </section>

          <BalanceFeedbackForm
            matchSeriesId={id}
            draftId={review.draftId ?? match.teamBalanceDraftId ?? null}
            selectedOptionType={review.selectedOptionType}
            initialRating={review.feedbackRating}
            initialProblemTeam={review.feedbackProblemTeam}
            initialProblemLine={review.feedbackProblemLine}
            initialMemo={review.feedbackMemo}
          />
        </>
      ) : (
        <section className="ai-panel ai-warning">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">AI 리뷰가 없습니다</h2>
              <p className="ai-panel__desc">이 내전은 등록되어 있지만 AI MMR 분석 결과가 없습니다. 아래 버튼으로 현재 내전만 재분석할 수 있습니다.</p>
            </div>
          </div>
          <MatchAiReanalyzeButton matchId={id} />
        </section>
      )}

      <section className="ai-panel">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">플레이어별 MMR 변화</h2>
            <p className="ai-panel__desc">KDA, 승패, 포지션을 바탕으로 반영된 내부 MMR 변화입니다.</p>
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
              {results.length === 0 && <tr><td colSpan={7}>MMR 결과가 없습니다. 이 내전을 재분석하면 생성됩니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
