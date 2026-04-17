import { prisma } from "@/lib/prisma/client";
import MatchForm from "@/features/match/MatchForm";

type EditMatchPageProps = {
  params: Promise<{ matchId: string }>;
};

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

  return (
    <MatchForm
      mode="edit"
      submitUrl={`/api/matches/${match.id}`}
      seasons={seasons.map((season) => ({ id: season.id, name: season.name }))}
      players={players.map((player) => ({
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
      }))}
      champions={champions.map((champion) => ({
        id: champion.id,
        name: champion.name,
      }))}
      initialData={{
        id: match.id,
        seasonId: match.seasonId,
        title: match.title,
        matchDate,
        games: match.games.map((game) => ({
          gameNumber: game.gameNumber,
          durationMin: game.durationMin,
          winnerTeam: game.winnerTeam,
          participants: game.participants.map((participant) => ({
            playerId: participant.playerId,
            championId: participant.championId,
            playerInput:
              participant.player.nickname ||
              participant.player.name ||
              "",
            championInput: participant.champion.name || "",
            team: participant.team,
            position: participant.position,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            cs: participant.cs,
            gold: participant.gold,
          })),
        })),
      }}
    />
  );
}