export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

const POSITION_ORDER: Record<string, number> = {
  TOP: 0,
  JGL: 1,
  MID: 2,
  ADC: 3,
  SUP: 4,
};

function formatDate(value: Date) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function getTeamLabel(team: "RED" | "BLUE") {
  return team === "RED" ? "RED" : "BLUE";
}

type Props = {
  params: Promise<{ draftId: string }>;
};

export default async function AdminTeamBalanceDraftDetailPage({ params }: Props) {
  const { draftId } = await params;
  const id = Number(draftId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const draft = await prisma.teamBalanceDraft.findUnique({
    where: { id },
    include: {
      season: {
        select: {
          name: true,
        },
      },
      players: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              nickname: true,
              tag: true,
              currentTier: true,
              peakTier: true,
            },
          },
        },
      },
      balanceReviews: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          matchSeriesId: true,
          selectedOptionType: true,
          predictedRedWinRate: true,
          predictedBlueWinRate: true,
          actualWinner: true,
          qualityScore: true,
          aiRiskLevel: true,
          aiVerdict: true,
          createdAt: true,
        },
      },
    },
  });

  if (!draft) {
    notFound();
  }

  const teams = (["RED", "BLUE"] as const).map((team) => ({
    team,
    players: draft.players
      .filter((item) => item.team === team)
      .sort((a, b) => (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99)),
  }));

  return (
    <main className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <p className="page-kicker">ADMIN · TEAM BALANCE DRAFT</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{draft.title}</h1>
          <p className="page-description" style={{ margin: 0 }}>
            {draft.season?.name ?? "시즌 없음"} · {formatDate(draft.createdAt)}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button" href="/admin/balance/drafts">목록</Link>
          <Link className="button" href={`/admin/balance/drafts/${draft.id}/recommendations`}>밴픽 추천</Link>
          <Link className="button button--primary" href="/admin/matches/new">내전 등록</Link>
        </div>
      </div>

      <section className="admin-card" style={{ marginBottom: 20 }}>
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <div className="stat-card"><span>선택안</span><strong>{draft.optionType ?? "-"}</strong></div>
          <div className="stat-card"><span>RED 총점</span><strong>{formatNumber(draft.redTotal)}</strong></div>
          <div className="stat-card"><span>BLUE 총점</span><strong>{formatNumber(draft.blueTotal)}</strong></div>
          <div className="stat-card"><span>차이</span><strong>{formatNumber(draft.diff)}</strong></div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        {teams.map(({ team, players }) => (
          <section key={team} className="admin-card">
            <h2 className="section-title" style={{ marginTop: 0 }}>{getTeamLabel(team)}</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>포지션</th>
                    <th>플레이어</th>
                    <th>역할</th>
                    <th>점수</th>
                    <th>기본</th>
                    <th>보정</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((item) => (
                    <tr key={item.id}>
                      <td>{item.position}</td>
                      <td>
                        <Link href={`/admin/players/${item.player.id}/edit`}>
                          {item.player.name} · {item.player.nickname}#{item.player.tag}
                        </Link>
                        <div style={{ fontSize: 12, opacity: 0.72 }}>
                          현재 {item.player.currentTier ?? "-"} / 최고 {item.player.peakTier ?? "-"}
                        </div>
                      </td>
                      <td>{item.roleType ?? "-"}</td>
                      <td>{formatNumber(item.score)}</td>
                      <td>{formatNumber(item.baseScore)}</td>
                      <td>
                        솔랭 {formatNumber(item.soloBonus)} / 포지션 {formatNumber(item.positionBonus)} / 감점 {formatNumber(item.rolePenalty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="admin-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>연결된 AI 리뷰</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>리뷰</th>
                <th>내전</th>
                <th>예상 승률</th>
                <th>실제 승리</th>
                <th>품질</th>
                <th>위험도</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {draft.balanceReviews.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24 }}>
                    이 밸런스 결과에 연결된 AI 리뷰가 아직 없습니다.
                  </td>
                </tr>
              ) : (
                draft.balanceReviews.map((review) => (
                  <tr key={review.id}>
                    <td>#{review.id}</td>
                    <td>
                      <Link href={`/admin/matches/${review.matchSeriesId}/ai-review`}>
                        내전 #{review.matchSeriesId}
                      </Link>
                    </td>
                    <td>
                      RED {formatNumber(review.predictedRedWinRate)}% / BLUE {formatNumber(review.predictedBlueWinRate)}%
                    </td>
                    <td>{review.actualWinner ?? "-"}</td>
                    <td>{formatNumber(review.qualityScore)}</td>
                    <td>{review.aiRiskLevel ?? "-"}</td>
                    <td>{formatDate(review.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
