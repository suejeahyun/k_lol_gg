import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Crown, Gamepad2, ShieldCheck } from "lucide-react";

import { ChampionPortrait } from "@/components/champions/champion-portrait";
import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";

import styles from "../matches.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "경기 상세", robots: { index: true, follow: true } };

function teamLabel(team: "BLUE" | "RED") {
  return team === "BLUE" ? "블루팀" : "레드팀";
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { matchId } = await params;
  if (Object.keys(await searchParams).length !== 0) notFound();
  if (/^[1-9][0-9]{0,9}$/.test(matchId) && Number(matchId) <= 2_147_483_647) {
    const mapping = await loadRuntimeMatchData((service) => service.getPublicIdByLegacyId(Number(matchId)));
    if (mapping.state === "ready" && !mapping.data) notFound();
    if (mapping.state === "ready") permanentRedirect(`/matches/${mapping.data}`);
    return <div className={`page-wrap ${styles.page}`}><section className={styles.state} role={mapping.state === "error" ? "alert" : "status"}><Gamepad2 /><h1>경기 주소를 확인하지 못했어요.</h1></section></div>;
  }
  const result = await loadRuntimeMatchData((service) => service.getPublic(matchId));
  if (result.state === "ready" && !result.data) notFound();

  return (
    <div className={`page-wrap ${styles.page}`}>
      <Link className="back-link" href="/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 결과</Link>
      {result.state === "unavailable" ? (
        <section className={styles.state} role="status"><Gamepad2 /><h1>경기 결과를 확인할 수 없어요.</h1></section>
      ) : result.state === "error" ? (
        <section className={styles.state} role="alert"><ShieldCheck /><h1>경기 상세를 불러오지 못했어요.</h1></section>
      ) : result.data ? (
        <>
          <section className={styles.detailHero} aria-labelledby="match-title">
            <div><span>{result.data.season.name}</span><h1 id="match-title">{result.data.title}</h1><p><CalendarDays size={15} aria-hidden="true" /> {result.data.playedOn}</p></div>
            <div className={styles.seriesScore} aria-label={`시리즈 결과 블루 ${result.data.blueWins} 대 레드 ${result.data.redWins}`}><span>BLUE</span><strong>{result.data.blueWins}</strong><b>:</b><strong>{result.data.redWins}</strong><span>RED</span></div>
          </section>
          <section className={styles.gameList} aria-label="게임별 스코어보드">
            {result.data.games.map((game) => (
              <article className={styles.game} key={game.gameNumber}>
                <header className={styles.gameHeader}><strong>GAME {game.gameNumber}</strong><span>{teamLabel(game.winnerTeam)} 승리 · {Math.floor(game.durationSeconds / 60)}분 {game.durationSeconds % 60}초</span></header>
                <div className={styles.teams}>
                  {(["BLUE", "RED"] as const).map((team) => (
                    <section className={styles.team} key={team} aria-label={teamLabel(team)}>
                      <h3>{teamLabel(team)}</h3>
                      {game.participants.filter((player) => player.team === team).map((player) => (
                        <div className={styles.player} key={`${player.team}-${player.position}`}>
                          <ChampionPortrait displayName={player.championName || player.championKey} imageUrl={player.championImageUrl} />
                          {player.profileAvailable ? <Link href={`/players/${player.playerId}`}><strong>{player.nickname}</strong><small>{player.tagLine} · {player.position} · {player.championName || player.championKey}</small></Link> : <div><strong>{player.nickname}</strong><small>{player.tagLine} · {player.position} · {player.championName || player.championKey} · 비활성 프로필</small></div>}
                          <span>{player.kills}/{player.deaths}/{player.assists}{player.playerId === game.mvpPlayerId ? <b className={styles.mvp} aria-label="이 게임 MVP"><Crown size={14} aria-hidden="true" /> MVP</b> : null}</span>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </section>
          <p className={styles.privacy}>닉네임, 챔피언, 포지션, KDA와 경기 결과를 확인할 수 있어요. MVP 산정 기준: {result.data.formulaVersion}.</p>
        </>
      ) : null}
    </div>
  );
}
