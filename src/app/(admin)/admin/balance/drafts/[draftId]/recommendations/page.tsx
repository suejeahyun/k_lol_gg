export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamBalanceDraftRecommendations } from "@/lib/team-balance/draft-recommendations";

type Props = { params: Promise<{ draftId: string }> };

function fmt(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function teamBadge(team: "RED" | "BLUE") {
  return team === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue";
}

function scoreBadge(score: number) {
  if (score >= 70) return "ai-badge ai-badge--low";
  if (score >= 50) return "ai-badge ai-badge--medium";
  return "ai-badge ai-badge--high";
}

export default async function AdminBalanceDraftRecommendationsPage({ params }: Props) {
  const { draftId } = await params;
  const id = Number(draftId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const data = await getTeamBalanceDraftRecommendations(id);
  if (!data) notFound();

  return (
    <main className="page-container ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">ADMIN · DRAFT PICK · BAN RECOMMENDATION</p>
          <h1 className="page-title">밴픽 추천 · {data.draft.title}</h1>
          <p className="page-description">
            저장된 팀 밸런스 결과를 기준으로 플레이어별 주력 챔피언, 밴 우선순위, 포지션 페어 호흡, 팀 조합 방향을 계산합니다.
          </p>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href={`/admin/balance/drafts/${data.draft.id}`}>밸런스 상세</Link>
            <Link className="button-secondary" href="/admin/balance/drafts">목록</Link>
            <Link className="button-primary" href="/admin/balance">새 계산</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>시즌</span><strong>{data.draft.seasonName ?? "-"}</strong><small>{formatDate(data.draft.createdAt)}</small></article>
        <article className="ai-kpi"><span>저장안</span><strong>{data.draft.optionType ?? "-"}</strong><small>TeamBalanceDraft #{data.draft.id}</small></article>
        <article className="ai-kpi"><span>점수 차이</span><strong>{fmt(data.draft.diff)}</strong><small>RED {fmt(data.draft.redTotal)} / BLUE {fmt(data.draft.blueTotal)}</small></article>
        <article className="ai-kpi"><span>챔피언 데이터</span><strong>{data.summary.championDataCount}</strong><small>플레이어-라인별 TOP 기록</small></article>
        <article className="ai-kpi"><span>평균 풀 안정도</span><strong>{fmt(data.summary.averagePoolScore)}</strong><small>밴픽 참고 지표</small></article>
      </section>

      <section className="ai-panel ai-panel--strong">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">추천 방식</h2>
            <p className="ai-panel__desc">챔피언 숙련도는 팀 밸런스 점수를 크게 바꾸지 않고, 저장된 팀 기준의 밴픽 참고값으로만 사용합니다.</p>
          </div>
        </div>
        <ul className="ai-list">
          <li>밴 추천: 상대 플레이어가 현재 배정된 포지션에서 자주 쓰고 성과가 좋은 챔피언을 우선 표시합니다.</li>
          <li>픽 추천: 우리 팀 플레이어별 현재 라인 기준 주력/안정 챔피언을 표시합니다.</li>
          <li>조합 추천: ADC-SUP, JGL-MID, JGL-TOP, JGL-SUP, JGL-ADC, MID-SUP 기록을 우선 확인합니다.</li>
          <li>표본이 적은 챔피언은 “표본 부족”으로 남기고, 밸런스 판단을 뒤집는 근거로 쓰지 않습니다.</li>
        </ul>
      </section>

      {data.teams.map((team) => (
        <section className="ai-panel" key={team.team}>
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title"><span className={teamBadge(team.team)}>{team.team}</span> 밴픽 추천</h2>
              <p className="ai-panel__desc">{team.team} 입장에서 사용할 픽과 상대에게 추천하는 밴 카드입니다.</p>
            </div>
          </div>

          <div className="ai-recommendation-grid">
            <article className="ai-sub-panel">
              <h3>상대 밴 우선순위</h3>
              <div className="ai-table-wrap">
                <table className="ai-table">
                  <thead>
                    <tr><th>순위</th><th>밴 후보</th><th>대상</th><th>기록</th><th>점수</th></tr>
                  </thead>
                  <tbody>
                    {team.banRecommendations.map((ban, index) => (
                      <tr key={`${team.team}-ban-${ban.playerId}-${ban.championId}-${index}`}>
                        <td>{index + 1}</td>
                        <td><strong>{ban.championName}</strong><br /><small>{ban.reason}</small></td>
                        <td>{ban.position} {ban.playerName}<br /><small>{ban.nickname}#{ban.tag}</small></td>
                        <td>{ban.games}판 {ban.wins}승 · {pct(ban.winRate)}<br /><small>KDA {fmt(ban.kda, 2)} · 최근 {ban.recentGames}판</small></td>
                        <td><span className={scoreBadge(ban.priorityScore)}>{fmt(ban.priorityScore)}</span></td>
                      </tr>
                    ))}
                    {team.banRecommendations.length === 0 && <tr><td colSpan={5}>추천할 만큼 누적된 상대 챔피언 기록이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="ai-sub-panel">
              <h3>우리 팀 조합 방향</h3>
              <ul className="ai-risk-list">
                {team.plans.map((plan, index) => <li key={`${team.team}-plan-${index}`}>{plan}</li>)}
              </ul>
              <h3 style={{ marginTop: 18 }}>운영 메모</h3>
              <ul className="ai-list">
                {team.notes.map((note, index) => <li key={`${team.team}-note-${index}`}>{note}</li>)}
              </ul>
            </article>
          </div>

          <div className="ai-recommendation-grid ai-recommendation-grid--wide">
            <article className="ai-sub-panel">
              <h3>플레이어별 픽 추천</h3>
              <div className="ai-table-wrap">
                <table className="ai-table ai-table--wide">
                  <thead>
                    <tr><th>라인</th><th>플레이어</th><th>챔피언 풀</th><th>추천 챔피언</th></tr>
                  </thead>
                  <tbody>
                    {team.pickRecommendations.map((player) => (
                      <tr key={`${team.team}-pick-${player.playerId}`}>
                        <td>{player.position}</td>
                        <td><Link href={`/players/${player.playerId}`}>{player.name}</Link><br /><small>{player.nickname}#{player.tag}</small></td>
                        <td><span className={scoreBadge(player.championPoolScore)}>{player.championPoolLabel}</span><br /><small>{fmt(player.championPoolScore)}점</small></td>
                        <td>
                          {player.topChampions.length > 0 ? (
                            <div className="ai-chip-list">
                              {player.topChampions.slice(0, 5).map((champion) => (
                                <span className="ai-chip" key={`${player.playerId}-${champion.championId}`}>
                                  {champion.championName} · {champion.games}판 {pct(champion.winRate)} · KDA {fmt(champion.kda, 2)}
                                </span>
                              ))}
                            </div>
                          ) : "기록 없음"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="ai-sub-panel">
              <h3>포지션 페어 호흡</h3>
              <div className="ai-table-wrap">
                <table className="ai-table">
                  <thead>
                    <tr><th>페어</th><th>조합</th><th>기록</th><th>기대 대비</th><th>판정</th></tr>
                  </thead>
                  <tbody>
                    {team.rolePairs.map((pair) => (
                      <tr key={`${team.team}-pair-${pair.pairType}`}>
                        <td>{pair.label}<br /><small>{pair.pairType}</small></td>
                        <td>{pair.positionA} {pair.playerA}<br />{pair.positionB} {pair.playerB}</td>
                        <td>{pair.games}판 {pair.wins}승<br /><small>{pct(pair.winRate)}</small></td>
                        <td>{fmt(pair.synergyScore)}점<br /><small>초과 {pct(pair.overPerformance)}</small></td>
                        <td>{pair.verdict}</td>
                      </tr>
                    ))}
                    {team.rolePairs.length === 0 && <tr><td colSpan={5}>포지션 페어 기록이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
      ))}
    </main>
  );
}
