/* eslint-disable @next/next/no-img-element */
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import SoloRankDraftSyncButton from "@/components/balance/SoloRankDraftSyncButton";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";
import { getTeamBalanceDraftRecommendations } from "@/lib/team-balance/draft-recommendations";

const RECENT_DRAFT_LIMIT = 20;
type TeamValue = "RED" | "BLUE";
type Props = { searchParams: Promise<{ draftId?: string; team?: string }> };

function fmt(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "-";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}%`
    : "-";
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
  return (
    title
      .replace(/^\s*\d{4}[-./년\s]+\d{1,2}[-./월\s]+\d{1,2}\s*(?:일)?\s*/u, "")
      .replace(/^\s*[-·|/]\s*/, "")
      .trim() || "저장 밸런스"
  );
}

function getDraftOptionLabel(draft: {
  id: number;
  title: string;
  optionType: string | null;
  createdAt: Date;
}) {
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

function teamLabel(team: TeamValue) {
  return team;
}

function positionLabel(position: string) {
  return position;
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

export default async function BalanceRecommendationsIndexPage({
  searchParams,
}: Props) {
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
  const selectedDraftId = drafts.some((draft) => draft.id === requestedId)
    ? requestedId
    : (drafts[0]?.id ?? null);
  const selectedTeam: TeamValue = sp.team === "BLUE" ? "BLUE" : "RED";
  const data = selectedDraftId
    ? await getTeamBalanceDraftRecommendations(selectedDraftId)
    : null;
  const selectedDraft =
    drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  const activeTeam =
    data?.teams.find((team) => team.team === selectedTeam) ??
    data?.teams[0] ??
    null;
  const oppositeTeam = selectedTeam === "RED" ? "BLUE" : "RED";

  return (
    <main className="page-container ai-page ai-pickban-page">
      <section className="ai-hero ai-hero--compact">
        <div className="ai-hero__content">
          <p className="eyebrow">PICK · BAN</p>
          <h1 className="page-title">밴픽 추천</h1>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href="/players/balance">
              팀 밸런스
            </Link>
          </div>
        </div>
      </section>

      <section className="ai-panel ai-import-panel">
        <form
          className="ai-import-form"
          action="/players/balance/recommendations"
          method="get"
        >
          <label className="ai-field">
            <span>최근 저장 밸런스</span>
            <select name="draftId" defaultValue={selectedDraftId ?? ""}>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {getDraftOptionLabel(draft)}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="team" value={selectedTeam} />
          <button className="button-primary" type="submit">
            가져오기
          </button>
        </form>
        {selectedDraft ? (
          <div className="ai-import-summary ai-import-summary--with-sync">
            <div>
              <strong>{getDraftOptionLabel(selectedDraft)}</strong>
              <span>
                RED {fmt(selectedDraft.redTotal)} / BLUE{" "}
                {fmt(selectedDraft.blueTotal)}
              </span>
              <span>
                차이 {fmt(selectedDraft.diff)} · {selectedDraft._count.players}
                명
              </span>
            </div>
            {selectedDraftId ? (
              <SoloRankDraftSyncButton draftId={selectedDraftId} />
            ) : null}
          </div>
        ) : (
          <div className="ai-import-summary">저장된 팀 밸런스가 없습니다.</div>
        )}
      </section>

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

          <section className="ai-panel ai-pickban-board">
            <div className="ai-panel__head">
              <div>
                <h2 className="ai-panel__title">
                  <span className={teamBadge(selectedTeam)}>
                    {teamLabel(selectedTeam)}
                  </span>{" "}
                  라인별 추천 챔피언
                </h2>
                <p className="ai-panel__desc">
                  가져온 밸런스 10명 기준으로 내전 챔피언 기록을 우선 반영하고, 솔랭에서 많이 사용했으며 승률/KDA가 좋은 챔피언을 보조 후보로 반영합니다.
                </p>
              </div>
            </div>

            <div className="ai-line-card-grid">
              {activeTeam.pickRecommendations.map((player) => (
                <article
                  className="ai-line-card"
                  key={`${activeTeam.team}-${player.playerId}`}
                >
                  <div className="ai-line-card__head">
                    <span className="ai-line-card__position">
                      {positionLabel(player.position)}
                    </span>
                    <div>
                      <strong>{player.name}</strong>
                      <small>
                        {player.nickname}#{player.tag}
                      </small>
                    </div>
                    <span className={scoreBadge(player.championPoolScore)}>
                      {player.championPoolLabel}
                    </span>
                  </div>

                  <div className="ai-source-section">
                    <div className="ai-source-section__title">
                      내전 챔피언 기록
                    </div>
                    {player.topChampions.length > 0 ? (
                      <div className="ai-champion-card-list">
                        {player.topChampions.slice(0, 3).map((champion) => (
                          <div
                            className="ai-champion-card"
                            key={`${player.playerId}-inhouse-${champion.championId}`}
                          >
                            {champion.imageUrl ? (
                              <img
                                src={champion.imageUrl}
                                alt={champion.championName}
                                loading="lazy"
                              />
                            ) : (
                              <div className="ai-champion-card__fallback">
                                {champion.championName.slice(0, 1)}
                              </div>
                            )}
                            <div>
                              <strong>{champion.championName}</strong>
                              <small>
                                {champion.games}판 · 승률{" "}
                                {pct(champion.winRate)} · KDA{" "}
                                {fmt(champion.kda, 2)}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ai-empty-inline">
                        해당 라인 내전 챔피언 기록 없음
                      </p>
                    )}
                  </div>

                  <div className="ai-source-section ai-source-section--solo">
                    <div className="ai-source-section__title">
                      솔랭 주력 후보
                    </div>
                    {player.soloTopChampions.length > 0 ? (
                      <div className="ai-champion-card-list">
                        {player.soloTopChampions.slice(0, 3).map((champion) => (
                          <div
                            className="ai-champion-card"
                            key={`${player.playerId}-solo-${champion.championId}`}
                          >
                            {champion.imageUrl ? (
                              <img
                                src={champion.imageUrl}
                                alt={champion.championName}
                                loading="lazy"
                              />
                            ) : (
                              <div className="ai-champion-card__fallback">
                                {champion.championName.slice(0, 1)}
                              </div>
                            )}
                            <div>
                              <strong>{champion.championName}</strong>
                              <small>
                                {champion.games}판 · 승률{" "}
                                {pct(champion.winRate)} · KDA{" "}
                                {fmt(champion.kda, 2)}
                                {champion.positionMatched ? " · 라인 일치" : ""}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ai-empty-inline">솔랭 갱신 기록 없음</p>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="ai-ban-section">
              <div className="ai-panel__head ai-panel__head--sub">
                <div>
                  <h2 className="ai-panel__title">
                    <span className={teamBadge(oppositeTeam)}>{teamLabel(oppositeTeam)}</span>{" "}
                    상대 밴 후보
                  </h2>
                  <p className="ai-panel__desc">
                    상대 팀의 내전 주력 픽과 솔랭 고승률·고KDA 챔피언을 같은 기준으로 정렬합니다.
                  </p>
                </div>
              </div>

              <div className="ai-ban-grid">
                {activeTeam.banRecommendations.map((ban, index) => (
                  <div
                    className="ai-ban-card"
                    key={`${activeTeam.team}-ban-${ban.playerId}-${ban.source}-${ban.championId}-${index}`}
                  >
                    <div className="ai-ban-card__top">
                      <span className="ai-ban-card__rank">#{index + 1}</span>
                      <span className={scoreBadge(ban.priorityScore)}>
                        {fmt(ban.priorityScore)}
                      </span>
                    </div>
                    <div className="ai-ban-card__main">
                      {ban.imageUrl ? (
                        <img
                          src={ban.imageUrl}
                          alt={ban.championName}
                          loading="lazy"
                        />
                      ) : (
                        <div className="ai-champion-card__fallback">
                          {ban.championName.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <strong>{ban.championName}</strong>
                        <small>
                          <b>{ban.sourceLabel}</b> · {positionLabel(ban.position)} {ban.playerName}
                        </small>
                      </div>
                    </div>
                    <div className="ai-ban-card__stats">
                      <span>{ban.games}판</span>
                      <span>승률 {pct(ban.winRate)}</span>
                      <span>KDA {fmt(ban.kda, 2)}</span>
                    </div>
                    <small className="ai-ban-card__reason">{ban.reason}</small>
                  </div>
                ))}
                {activeTeam.banRecommendations.length === 0 ? (
                  <p className="ai-empty-inline">
                    밴 후보로 볼 만큼 누적된 기록이 없습니다.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="ai-panel ai-empty">
          팀 밸런스를 저장하면 이 페이지에서 밴픽 추천을 가져올 수 있습니다.
        </section>
      )}
    </main>
  );
}
