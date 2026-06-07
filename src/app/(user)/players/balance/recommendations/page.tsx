/* eslint-disable @next/next/no-img-element */
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";
import { getTeamBalanceDraftRecommendations } from "@/lib/team-balance/draft-recommendations";
import SoloRankDraftSyncButton from "@/components/balance/SoloRankDraftSyncButton";

const RECENT_DRAFT_LIMIT = 20;
type TeamValue = "RED" | "BLUE";
type Props = { searchParams: Promise<{ draftId?: string; team?: string }> };

function fmt(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

function formatDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function cleanDraftName(title: string, optionType: string | null | undefined) {
  if (optionType?.trim()) return optionType.trim();
  return title
    .replace(/^\s*\d{4}[-./년\s]+\d{1,2}[-./월\s]+\d{1,2}\s*(?:일)?\s*/u, "")
    .replace(/^\s*[-·|/]\s*/, "")
    .trim() || "저장 밸런스";
}

function getDraftOptionLabel(draft: { id: number; title: string; optionType: string | null; createdAt: Date }) {
  return `#${draft.id} ${formatDay(draft.createdAt)} ${cleanDraftName(draft.title, draft.optionType)}`;
}

function teamBadge(team: TeamValue) {
  return team === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue";
}

function scoreBadge(score: number) {
  if (score >= 70) return "ai-badge ai-badge--low";
  if (score >= 50) return "ai-badge ai-badge--medium";
  return "ai-badge ai-badge--high";
}

function formatSoloRank(rank: { tier: string | null; rank: string | null; leaguePoints: number } | null | undefined) {
  if (!rank?.tier) return "솔랭 정보 없음";
  return `${rank.tier}${rank.rank ? ` ${rank.rank}` : ""} ${rank.leaguePoints}LP`;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "갱신 전";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getRecentSoloSummary(matches: Array<{ win: boolean; kills: number; deaths: number; assists: number }>) {
  const totalGames = matches.length;
  const wins = matches.filter((match) => match.win).length;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.assists, 0);

  return {
    totalGames,
    wins,
    winRate: totalGames > 0 ? (wins / totalGames) * 100 : null,
    kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
  };
}

async function requireAccessOrRedirect(nextPath: string) {
  try {
    await requireApprovedUserOrAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (error instanceof Error && error.message === "NOT_APPROVED") {
      redirect("/");
    }
    throw error;
  }
}

export default async function BalanceRecommendationsIndexPage({ searchParams }: Props) {
  await requireAccessOrRedirect("/players/balance/recommendations");

  const sp = await searchParams;
  const drafts = await prisma.teamBalanceDraft.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECENT_DRAFT_LIMIT,
    select: {
      id: true,
      title: true,
      optionType: true,
      createdAt: true,
      redTotal: true,
      blueTotal: true,
      diff: true,
      _count: { select: { players: true } },
    },
  });

  const requestedId = Number(sp.draftId ?? drafts[0]?.id ?? 0);
  const selectedDraftId = drafts.some((draft) => draft.id === requestedId) ? requestedId : drafts[0]?.id ?? null;
  const selectedTeam: TeamValue = sp.team === "BLUE" ? "BLUE" : "RED";
  const data = selectedDraftId ? await getTeamBalanceDraftRecommendations(selectedDraftId) : null;
  const soloRankPlayers = selectedDraftId
    ? await prisma.teamBalanceDraftPlayer.findMany({
        where: { draftId: selectedDraftId },
        orderBy: [{ team: "asc" }, { position: "asc" }],
        select: {
          team: true,
          position: true,
          player: {
            select: {
              id: true,
              name: true,
              nickname: true,
              tag: true,
              riotAccount: { select: { lastSyncedAt: true } },
              soloRankSnapshot: {
                select: { tier: true, rank: true, leaguePoints: true, wins: true, losses: true, winRate: true },
              },
              soloMatches: {
                orderBy: { gameCreation: "desc" },
                take: 20,
                select: { win: true, kills: true, deaths: true, assists: true },
              },
            },
          },
        },
      })
    : [];
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  const activeTeam = data?.teams.find((team) => team.team === selectedTeam) ?? data?.teams[0] ?? null;
  const oppositeTeam = selectedTeam === "RED" ? "BLUE" : "RED";

  return (
    <main className="page-container ai-page ai-pickban-page">
      <section className="ai-hero ai-hero--compact">
        <div className="ai-hero__content">
          <p className="eyebrow">PICK · BAN</p>
          <h1 className="page-title">밴픽 추천</h1>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href="/players/balance">팀 밸런스</Link>
          </div>
        </div>
      </section>

      <section className="ai-panel ai-import-panel">
        <form className="ai-import-form" action="/players/balance/recommendations" method="get">
          <label className="ai-field">
            <span>최근 저장 밸런스</span>
            <select name="draftId" defaultValue={selectedDraftId ?? ""}>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>{getDraftOptionLabel(draft)}</option>
              ))}
            </select>
          </label>
          <input type="hidden" name="team" value={selectedTeam} />
          <button className="button-primary" type="submit">가져오기</button>
        </form>
        {selectedDraft ? (
          <div className="ai-import-summary">
            <strong>{getDraftOptionLabel(selectedDraft)}</strong>
            <span>RED {fmt(selectedDraft.redTotal)} / BLUE {fmt(selectedDraft.blueTotal)}</span>
            <span>차이 {fmt(selectedDraft.diff)} · {selectedDraft._count.players}명</span>
            {selectedDraftId ? <SoloRankDraftSyncButton draftId={selectedDraftId} /> : null}
          </div>
        ) : (
          <div className="ai-import-summary">저장된 팀 밸런스가 없습니다.</div>
        )}
      </section>

      {soloRankPlayers.length > 0 ? (
        <section className="ai-panel ai-solo-rank-panel">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">최근 솔로 랭크 전적</h2>
              <p className="ai-panel__desc">현재 저장 밸런스에 포함된 플레이어만 표시합니다.</p>
            </div>
          </div>
          <div className="ai-solo-rank-grid">
            {soloRankPlayers.map((entry) => {
              const summary = getRecentSoloSummary(entry.player.soloMatches);
              return (
                <article className="ai-solo-rank-card" key={entry.player.id}>
                  <div className="ai-solo-rank-card__head">
                    <span className={teamBadge(entry.team as TeamValue)}>{entry.team}</span>
                    <strong>{entry.position} · {entry.player.name}</strong>
                  </div>
                  <small>{entry.player.nickname}#{entry.player.tag}</small>
                  <div className="ai-solo-rank-card__rank">{formatSoloRank(entry.player.soloRankSnapshot)}</div>
                  <div className="ai-solo-rank-card__stats">
                    <span>최근 {summary.totalGames}판</span>
                    <span>승률 {pct(summary.winRate)}</span>
                    <span>KDA {fmt(summary.kda, 2)}</span>
                  </div>
                  <div className="ai-solo-rank-card__sync">마지막 갱신 {formatDateTime(entry.player.riotAccount?.lastSyncedAt)}</div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {data && activeTeam ? (
        <>
          <section className="ai-team-switch" aria-label="팀 기준 변경">
            <Link
              className={`ai-team-switch__button${selectedTeam === "RED" ? " ai-team-switch__button--active ai-team-switch__button--red" : ""}`}
              href={`/players/balance/recommendations?draftId=${data.draft.id}&team=RED`}
            >
              RED 기준 보기
            </Link>
            <Link
              className={`ai-team-switch__button${selectedTeam === "BLUE" ? " ai-team-switch__button--active ai-team-switch__button--blue" : ""}`}
              href={`/players/balance/recommendations?draftId=${data.draft.id}&team=BLUE`}
            >
              BLUE 기준 보기
            </Link>
          </section>

          <section className="ai-kpi-grid ai-kpi-grid--compact">
            <article className="ai-kpi"><span>선택 팀</span><strong>{selectedTeam}</strong><small>현재 기준</small></article>
            <article className="ai-kpi"><span>상대 팀</span><strong>{oppositeTeam}</strong><small>밴 후보 대상</small></article>
            <article className="ai-kpi"><span>챔피언 기록</span><strong>{data.summary.championDataCount}</strong><small>라인별 추천 기준</small></article>
            <article className="ai-kpi"><span>평균 풀</span><strong>{fmt(data.summary.averagePoolScore)}</strong><small>안정도</small></article>
          </section>

          <section className="ai-panel ai-pickban-board">
            <div className="ai-panel__head">
              <div>
                <h2 className="ai-panel__title"><span className={teamBadge(selectedTeam)}>{selectedTeam}</span> 라인별 추천 챔피언</h2>
              </div>
            </div>

            <div className="ai-line-card-grid">
              {activeTeam.pickRecommendations.map((player) => (
                <article className="ai-line-card" key={`${activeTeam.team}-${player.playerId}`}>
                  <div className="ai-line-card__head">
                    <span className="ai-line-card__position">{player.position}</span>
                    <div>
                      <strong>{player.name}</strong>
                      <small>{player.nickname}#{player.tag}</small>
                    </div>
                    <span className={scoreBadge(player.championPoolScore)}>{player.championPoolLabel}</span>
                  </div>
                  {player.topChampions.length > 0 ? (
                    <div className="ai-champion-card-list">
                      {player.topChampions.slice(0, 3).map((champion) => (
                        <div className="ai-champion-card" key={`${player.playerId}-${champion.championId}`}>
                          {champion.imageUrl ? (
                            <img src={champion.imageUrl} alt={champion.championName} loading="lazy" />
                          ) : (
                            <div className="ai-champion-card__fallback">{champion.championName.slice(0, 1)}</div>
                          )}
                          <div>
                            <strong>{champion.championName}</strong>
                            <small>{champion.games}판 · {pct(champion.winRate)} · KDA {fmt(champion.kda, 2)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ai-empty-inline">해당 라인 챔피언 기록 없음</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="ai-pickban-grid">
            <article className="ai-panel">
              <div className="ai-panel__head">
                <h2 className="ai-panel__title">상대 밴 후보</h2>
                <span className={teamBadge(oppositeTeam)}>{oppositeTeam}</span>
              </div>
              <div className="ai-ban-list">
                {activeTeam.banRecommendations.map((ban, index) => (
                  <div className="ai-ban-card" key={`${activeTeam.team}-ban-${ban.playerId}-${ban.championId}-${index}`}>
                    <span className="ai-ban-card__rank">#{index + 1}</span>
                    {ban.imageUrl ? <img src={ban.imageUrl} alt={ban.championName} loading="lazy" /> : <div className="ai-champion-card__fallback">{ban.championName.slice(0, 1)}</div>}
                    <div>
                      <strong>{ban.championName}</strong>
                      <small>{ban.position} {ban.playerName} · {ban.games}판 · {pct(ban.winRate)} · KDA {fmt(ban.kda, 2)}</small>
                    </div>
                    <span className={scoreBadge(ban.priorityScore)}>{fmt(ban.priorityScore)}</span>
                  </div>
                ))}
                {activeTeam.banRecommendations.length === 0 ? <p className="ai-empty-inline">밴 후보로 볼 만큼 누적된 기록이 없습니다.</p> : null}
              </div>
            </article>

            <article className="ai-panel">
              <div className="ai-panel__head">
                <h2 className="ai-panel__title">포지션 페어 호흡</h2>
              </div>
              <div className="ai-pair-card-grid">
                {activeTeam.rolePairs.map((pair) => (
                  <div className="ai-pair-card" key={`${activeTeam.team}-pair-${pair.pairType}`}>
                    <div className="ai-pair-card__top">
                      <strong>{pair.label}</strong>
                      <span className={pair.synergyScore >= 2 ? "ai-badge ai-badge--low" : pair.synergyScore <= -2 ? "ai-badge ai-badge--high" : "ai-badge ai-badge--medium"}>{pair.verdict}</span>
                    </div>
                    <div className="ai-pair-card__players">
                      <span>{pair.positionA} {pair.playerA}</span>
                      <span>{pair.positionB} {pair.playerB}</span>
                    </div>
                    <div className="ai-pair-card__stats">
                      <span>{pair.games}판 {pair.wins}승</span>
                      <span>승률 {pct(pair.winRate)}</span>
                      <span>시너지 {fmt(pair.synergyScore)}</span>
                    </div>
                  </div>
                ))}
                {activeTeam.rolePairs.length === 0 ? <p className="ai-empty-inline">포지션 페어 기록이 없습니다.</p> : null}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="ai-panel ai-empty">팀 밸런스를 저장하면 이 페이지에서 밴픽 추천을 가져올 수 있습니다.</section>
      )}
    </main>
  );
}
