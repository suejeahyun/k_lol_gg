import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";
import { analyzeMatchIntegrity } from "@/modules/matches/domain/match-integrity-review";

import { zonedStartedAtFromStoredInstant } from "../admin-match-conflict";
import { MatchEditor } from "../match-editor";
import { MatchIntegrityReview } from "./match-integrity-review";
import styles from "../matches-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminMatchDetailPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { matchId } = await params;
  const result = await loadRuntimeMatchData(async (service) => {
    const match = await service.getAdminMatch(matchId);
    const playerIds = match?.games.flatMap((game) =>
      game.participants.map((participant) => participant.playerId)) ?? [];
    return [match, await service.getAdminEditorCatalog(playerIds)] as const;
  });
  if (result.state === "ready" && !result.data[0]) notFound();
  if (result.state !== "ready" || !result.data[0]) {
    return <main className={styles.page}><Link href="/admin/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 목록</Link><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h1>경기 데이터를 불러오지 못했습니다.</h1></section></main>;
  }
  const [match, catalog] = result.data;
  const rawTab = (await searchParams).tab;
  const tab = (Array.isArray(rawTab) ? rawTab[0] : rawTab) === "ai-review" ? "ai-review" : "edit";
  const review = analyzeMatchIntegrity(match, {
    playerIds: new Set(catalog.players.map((player) => player.id)),
    activePlayerIds: new Set(catalog.players.filter((player) => player.status === "ACTIVE").map((player) => player.id)),
    championKeys: new Set(catalog.champions.map((champion) => champion.key)),
    activeChampionKeys: new Set(catalog.champions.filter((champion) => champion.status === "ACTIVE").map((champion) => champion.key)),
  });
  return <main className={styles.page}>
    <Link href="/admin/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 목록</Link>
    <section className={styles.hero}><div><p>{match.status} · REV {match.revision}</p><h1>{match.title}</h1><p>{match.seasonName} · {match.playedOn} · {match.blueWins}:{match.redWins}</p></div></section>
    <nav className={styles.tabs} aria-label="경기 상세 메뉴"><Link href={`/admin/matches/${match.id}`} data-active={tab === "edit"}>경기 편집</Link><Link href={`/admin/matches/${match.id}?tab=ai-review`} data-active={tab === "ai-review"}>AI/자동 검수</Link></nav>
    {tab === "ai-review" ? <MatchIntegrityReview review={review} /> : <MatchEditor
      initialState={{ id: match.id, status: match.status, revision: match.revision }}
      initialBody={{
        seasonId: match.seasonId,
        title: match.title,
        playedOn: match.playedOn,
        startedAt: zonedStartedAtFromStoredInstant(match.startedAt, match.startedAtOffsetMinutes),
        games: match.games,
      }}
      catalog={catalog}
    />}
  </main>;
}
