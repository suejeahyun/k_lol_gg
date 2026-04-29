import type { ComponentProps } from "react";
import { prisma } from "@/lib/prisma/client";
import MatchForm from "@/features/match/MatchForm";

type EditMatchPageProps = {
  params: Promise<{ matchId: string }>;
};

type MatchFormProps = ComponentProps<typeof MatchForm>;
type MatchFormSeason = MatchFormProps["seasons"][number];
type MatchFormPlayer = MatchFormProps["players"][number];
type MatchFormChampion = MatchFormProps["champions"][number];
type MatchFormGame = MatchFormProps["initialData"]["games"][number];
type MatchFormParticipant = MatchFormGame["participants"][number];

export default async function EditMatchPage({ params }: EditMatchPageProps) {
  const { matchId } = await params;
  const id = Number(matchId);

  const [match, seasons, players, champions] = await Promise.all([
    prisma.matchSeries.findUnique({
      where: { id },
      include: {
        games: {
          orderBy: {
            gameNumber: "asc",
          },
          include: {
            participants: {
              orderBy: {
                id: "asc",
              },
              include: {
                player: true,
                champion: true,
              },
            },
          },
        },
      },
    }),
    prisma.season.findMany({
      orderBy: { id: "desc" },
    }),
    prisma.player.findMany({
      orderBy: { id: "asc" },
    }),
    prisma.champion.findMany({
      orderBy: { id: "asc" },
    }),
  ]);

  if (!match) {
    throw new Error("Match not found");
  }

  const matchDate = new Date(
    match.matchDate.getTime() - match.matchDate.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);

  const seasonItems: MatchFormSeason[] = seasons.map((season) => ({
    id: season.id,
    name: season.name,
  }));

  const playerItems: MatchFormPlayer[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    nickname: player.nickname ?? "",
    tag: player.tag ?? "",
  }));

  const championItems: MatchFormChampion[] = champions.map((champion) => ({
    id: champion.id,
    name: champion.name,
  }));

  const formGames: MatchFormGame[] = match.games.map((game) => ({
    gameNumber: game.gameNumber,
    winnerTeam: game.winnerTeam,
    participants: game.participants.map((participant) => ({
      playerId: participant.playerId,
      playerInput: `${participant.player.name} (${participant.player.nickname}#${participant.player.tag})`,
      championId: participant.championId,
      championInput: participant.champion.name,
      team: participant.team,
      position: participant.position,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
    })),
  }));

  const initialData: MatchFormProps["initialData"] = {
    id: match.id,
    seasonId: match.seasonId,
    title: match.title,
    matchDate,
    games: formGames,
  };

  return (
    <MatchForm
      mode="edit"
      submitUrl={`/api/matches/${match.id}`}
      seasons={seasonItems}
      players={playerItems}
      champions={championItems}
      initialData={initialData}
    />
  );
}