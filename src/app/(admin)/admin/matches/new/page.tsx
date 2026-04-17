import { prisma } from "@/lib/prisma/client";
import MatchForm from "@/features/match/MatchForm";

export default async function NewMatchPage() {
  const [seasons, players, champions] = await Promise.all([
    prisma.season.findMany({ orderBy: { id: "desc" } }),
    prisma.player.findMany({ orderBy: { id: "asc" } }),
    prisma.champion.findMany({ orderBy: { id: "asc" } }),
  ]);

const currentSeason =
  seasons.find((season: (typeof seasons)[number]) => season.isActive) ??
  seasons[0];

  return (
    <MatchForm
      mode="create"
      submitUrl="/api/matches"
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
        seasonId: currentSeason?.id ?? 1,
        title: "",
        matchDate: new Date().toISOString().slice(0, 16),
        games: [],
      }}
    />
  );
}