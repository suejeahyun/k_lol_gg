export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";

type Props = { params: Promise<{ draftId: string }> };

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

function lines(value: string | null | undefined) {
  return (value ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
}

export default async function BalanceDraftDetailPage({ params }: Props) {
  await requireApprovedUserOrAdmin();
  const { draftId } = await params;
  const id = Number(draftId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const draft = await prisma.teamBalanceDraft.findUnique({
    where: { id },
    include: {
      players: { orderBy: [{ team: "desc" }, { position: "asc" }], include: { player: true } },
      balanceReviews: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!draft) notFound();

  const review = draft.balanceReviews[0];
  const teams = {
    RED: draft.players.filter((p) => p.team === "RED"),
    BLUE: draft.players.filter((p) => p.team === "BLUE"),
  };

  return (
    <main className="page-container ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">TEAM BALANCE DRAFT</p>
          <h1 className="page-title">{draft.title}</h1>
          <p className="page-description">{formatDate(draft.createdAt)} · {draft.optionType ?? "선택안 미지정"}</p>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href="/players/balance/drafts">목록</Link>
            <Link className="button-primary" href="/admin/matches/new">내전 등록으로 이동</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>RED</span><strong>{fmt(draft.redTotal)}</strong><small>총점</small></article>
        <article className="ai-kpi"><span>BLUE</span><strong>{fmt(draft.blueTotal)}</strong><small>총점</small></article>
        <article className="ai-kpi"><span>차이</span><strong>{fmt(draft.diff)}</strong><small>작을수록 균형</small></article>
        <article className="ai-kpi"><span>비용</span><strong>{fmt(draft.balanceCost)}</strong><small>밸런스 비용</small></article>
        <article className="ai-kpi"><span>위험도</span><strong><span className={riskClass(review?.aiRiskLevel)}>{review?.aiRiskLevel ?? "-"}</span></strong><small>AI 판단</small></article>
      </section>

      {review ? (
        <section className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">AI 판단</h2>
              <p className="ai-panel__desc">저장된 팀 구성 기준의 AI 예상 승률과 리스크입니다.</p>
            </div>
            <span className={riskClass(review.aiRiskLevel)}>{review.aiRiskLevel ?? "-"}</span>
          </div>
          <p className="ai-muted">{review.aiVerdict}</p>
          <ul className="ai-list">
            <li>예상 승률: RED {fmt(review.predictedRedWinRate)}% / BLUE {fmt(review.predictedBlueWinRate)}%</li>
            <li>품질 점수: {fmt(review.qualityScore)}</li>
            <li>AI 추론 우세: {review.aiInferredWinner ?? "-"}</li>
          </ul>
          {lines(review.aiRiskFactors).length > 0 && <ul className="ai-risk-list">{lines(review.aiRiskFactors).map((item, idx) => <li key={idx}>{item}</li>)}</ul>}
        </section>
      ) : (
        <section className="ai-panel ai-empty">이 저장 결과에는 아직 AI 리뷰가 연결되어 있지 않습니다. 내전 등록 후 AI 리뷰가 생성됩니다.</section>
      )}

      <section className="ai-team-grid">
        {(["RED", "BLUE"] as const).map((team) => (
          <section className="ai-panel" key={team}>
            <div className="ai-panel__head">
              <div>
                <h2 className="ai-panel__title"><span className={team === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue"}>{team}</span></h2>
                <p className="ai-panel__desc">포지션, 역할, 점수 산출 근거를 확인합니다.</p>
              </div>
            </div>
            <div className="ai-table-wrap">
              <table className="ai-table">
                <thead><tr><th>라인</th><th>플레이어</th><th>역할</th><th>최종</th><th>기본</th><th>솔랭</th><th>포지션</th><th>감점</th></tr></thead>
                <tbody>
                  {teams[team].map((item) => (
                    <tr key={item.id}>
                      <td>{item.position}</td>
                      <td><Link href={`/players/${item.playerId}`}>{item.player.name}</Link><br /><small>{item.player.nickname}#{item.player.tag}</small></td>
                      <td>{item.roleType ?? "-"}</td>
                      <td>{fmt(item.score)}</td>
                      <td>{fmt(item.baseScore)}</td>
                      <td>{fmt(item.soloBonus)}</td>
                      <td>{fmt(item.positionBonus)}</td>
                      <td>{fmt(item.rolePenalty)}</td>
                    </tr>
                  ))}
                  {teams[team].length === 0 && <tr><td colSpan={8}>{team} 팀 플레이어가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
