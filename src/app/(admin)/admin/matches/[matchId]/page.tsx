import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";

import { zonedStartedAtFromStoredInstant } from "../admin-match-conflict";
import { MatchEditor } from "../match-editor";
import styles from "../matches-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminMatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const result = await loadRuntimeMatchData(async (service) => {
    const match = await service.getAdminMatch(matchId);
    const playerIds = match?.games.flatMap((game) =>
      game.participants.map((participant) => participant.playerId)) ?? [];
    return [match, await service.getAdminEditorCatalog(playerIds)] as const;
  });
  if (result.state === "ready" && !result.data[0]) notFound();
  if (result.state !== "ready" || !result.data[0]) {
    return <main className={styles.page}><Link href="/admin/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 목록</Link><section className={styles.state}>경기 데이터를 불러오지 못했습니다.</section></main>;
  }
  const [match, catalog] = result.data;
  return <main className={styles.page}>
    <Link href="/admin/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 목록</Link>
    <section className={styles.hero}><div><p>{match.status} · REV {match.revision}</p><h1>{match.title}</h1><p>{match.seasonName} · {match.playedOn} · {match.blueWins}:{match.redWins}</p></div></section>
    <MatchEditor
      initialState={{ id: match.id, status: match.status, revision: match.revision }}
      initialBody={{
        seasonId: match.seasonId,
        title: match.title,
        playedOn: match.playedOn,
        startedAt: zonedStartedAtFromStoredInstant(match.startedAt, match.startedAtOffsetMinutes),
        games: match.games,
      }}
      catalog={catalog}
    />
  </main>;
}
