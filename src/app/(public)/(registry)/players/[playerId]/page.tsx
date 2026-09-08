import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Gamepad2, Hash, ShieldCheck, Sparkles, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ChampionPortrait } from "@/components/champions/champion-portrait";
import riotStyles from "@/components/riot/riot-workspace.module.css";
import { loadRuntimePlayerProfile } from "@/modules/players/infrastructure/runtime-player-data";
import { loadRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { loadRuntimeStatisticsData } from "@/modules/statistics/infrastructure/runtime-statistics-data";

import championStyles from "./player-champions.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "플레이어 상세",
  description: "K-LOL.GG 플레이어의 공개 프로필과 경기 기록을 확인합니다.",
};

function formatJoinedAt(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(value);
}
export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { playerId } = await params;
  const rawTab = (await searchParams).tab;
  const tab = rawTab === "riot" ? "riot" : "profile";
  const [result, statisticsResult] = await Promise.all([
    loadRuntimePlayerProfile(playerId),
    loadRuntimeStatisticsData((service) => service.getPublicPlayerStatistics(playerId, null)),
  ]);
  const riotResult = tab === "riot" ? await loadRuntimeRiot((runtime) => runtime.query.getPublicSummary(playerId)) : null;

  if (result.state === "ready" && !result.data) notFound();

  return (
    <div className="page-wrap player-detail-page">
      <Link className="back-link" href="/players"><ArrowLeft size={16} aria-hidden="true" /> 플레이어 목록</Link>

      {result.state === "unavailable" ? (
        <section className="detail-state" role="status" aria-labelledby="player-unavailable-title">
          <Sparkles size={34} aria-hidden="true" />
          <h1 id="player-unavailable-title">프로필을 확인할 수 없어요.</h1>
          <p>잠시 후 다시 확인해 주세요.</p>
        </section>
      ) : result.state === "error" ? (
        <section className="detail-state detail-state--error" role="alert" aria-labelledby="player-error-title">
          <Sparkles size={34} aria-hidden="true" />
          <h1 id="player-error-title">프로필을 불러오지 못했어요.</h1>
          <p>잠시 후 다시 시도하거나 플레이어 목록으로 돌아가 다른 프로필을 확인해 주세요.</p>
        </section>
      ) : result.data ? (
        <>
          <section className="player-detail-hero" aria-labelledby="player-title">
            <div className="player-detail-hero__avatar" aria-hidden="true">{result.data.displayName.slice(0, 1)}</div>
            <div>
              <Badge variant="secondary"><ShieldCheck size={13} aria-hidden="true" /> 공개 프로필</Badge>
              <h1 id="player-title">{result.data.displayName}</h1>
              <p><Hash size={14} aria-hidden="true" /> {result.data.riotId}</p>
            </div>
          </section>

          <nav className={riotStyles.tabs} aria-label="플레이어 상세 탭"><Link href={`/players/${playerId}`} aria-current={tab === "profile" ? "page" : undefined}>프로필</Link><Link href={`/players/${playerId}?tab=riot`} aria-current={tab === "riot" ? "page" : undefined}>Riot 전적</Link></nav>

          {tab === "riot" ? (
            <section className="profile-summary" aria-labelledby="riot-summary-title">
              <div className="section-heading"><div><p>RIOT</p><h2 id="riot-summary-title">공개 Riot 전적</h2></div><span>Riot ID와 솔로 랭크 요약을 확인할 수 있어요.</span></div>
              {riotResult?.state === "unavailable" ? <div className="profile-records__state" role="status">Riot 공개 연동이 아직 활성화되지 않았어요.</div>
                : riotResult?.state === "error" ? <div className="profile-records__state profile-records__state--error" role="alert">Riot 전적을 불러오지 못했습니다.</div>
                : !riotResult?.data ? <div className="profile-records__state">공개할 Riot 동기화 전적이 없습니다.</div>
                : <div className="profile-summary__grid"><article><span>Riot ID</span><strong>{riotResult.data.riotId}</strong></article><article><span>솔로 랭크</span><strong>{riotResult.data.soloTier ?? "Unranked"} {riotResult.data.soloRank ?? ""}</strong></article><article><span>LP · 전적</span><strong>{riotResult.data.leaguePoints ?? 0} LP · {riotResult.data.wins ?? 0}승 {riotResult.data.losses ?? 0}패</strong></article></div>}
            </section>
          ) : <>
          <section className="profile-summary" aria-labelledby="profile-summary-title">
            <div className="section-heading">
              <div><p>PROFILE</p><h2 id="profile-summary-title">프로필 요약</h2></div>
              <span>현재 티어와 주요 기록을 한눈에 확인하세요.</span>
            </div>
            <div className="profile-summary__grid">
              <article><span>현재 티어</span><strong>{result.data.currentTier ?? "미등록"}</strong></article>
              <article><span>최고 티어</span><strong>{result.data.peakTier ?? "미등록"}</strong></article>
              <article><span><CalendarDays size={15} aria-hidden="true" /> 등록일</span><strong>{formatJoinedAt(result.data.joinedAt)}</strong></article>
            </div>
          </section>

          <section className="profile-records" aria-labelledby="profile-records-title">
            <div className="section-heading">
              <div><p>RECORDS</p><h2 id="profile-records-title">시즌·포지션·챔피언 기록</h2></div>
              <span>{statisticsResult.state === "ready" && statisticsResult.data?.season ? statisticsResult.data.season.name : "공개 통계"}</span>
            </div>
            {statisticsResult.state === "unavailable" ? (
              <div className="profile-records__state" role="status">통계를 확인할 수 없어요. 잠시 후 다시 확인해 주세요.</div>
            ) : statisticsResult.state === "error" ? (
              <div className="profile-records__state profile-records__state--error" role="alert">통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</div>
            ) : !statisticsResult.data || statisticsResult.data.projection?.status !== "READY" ? (
              <div className="profile-records__state">이 플레이어의 시즌 통계를 집계하고 있어요.</div>
            ) : (
              <>
                <div className="profile-records__grid">
                  <article><Gamepad2 size={22} aria-hidden="true" /><strong>{statisticsResult.data.summary.wins}승 {statisticsResult.data.summary.losses}패</strong><p>{statisticsResult.data.summary.totalGames}게임 · 승률 {statisticsResult.data.summary.winRate}%</p></article>
                  <article><ShieldCheck size={22} aria-hidden="true" /><strong>참여 {statisticsResult.data.summary.participationCount}회</strong><p>{statisticsResult.data.positions[0] ? `주 포지션 ${statisticsResult.data.positions[0].position} · ${statisticsResult.data.positions[0].games}게임` : "포지션 기록 없음"}</p></article>
                  <article><Trophy size={22} aria-hidden="true" /><strong>MVP {statisticsResult.data.summary.mvpCount}회</strong><p>{statisticsResult.data.champions[0] ? `최다 챔피언 ${statisticsResult.data.champions[0].championName}` : "챔피언 기록 없음"}</p></article>
                </div>
                {statisticsResult.data.champions.length > 0 ? (
                  <div className={championStyles.championGrid} aria-label="많이 플레이한 챔피언">
                    {statisticsResult.data.champions.slice(0, 5).map((champion) => <article className={championStyles.championCard} key={champion.championKey}>
                      <ChampionPortrait displayName={champion.championName} imageUrl={champion.championImageUrl} />
                      <div><strong>{champion.championName}</strong><small>{champion.games}게임 · {champion.wins}승 · 승률 {champion.winRate}%</small></div>
                    </article>)}
                  </div>
                ) : null}
                {statisticsResult.data.recentMatches.length > 0 ? (
                  <div className="profile-recent" aria-label="최근 공개 경기">
                    {statisticsResult.data.recentMatches.slice(0, 5).map((match) => (
                      <Link className={championStyles.recentMatch} href={`/matches/${match.matchId}`} key={`${match.matchId}-${match.gameNumber}`}>
                        <ChampionPortrait displayName={match.championName} imageUrl={match.championImageUrl} />
                        <div><span>{match.playedOn} · {match.title} {match.gameNumber}게임</span>
                        <strong>{match.championName} · {match.won ? "승리" : "패배"}{match.mvp ? " · MVP" : ""}</strong></div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
          </>}
        </>
      ) : null}
    </div>
  );
}
