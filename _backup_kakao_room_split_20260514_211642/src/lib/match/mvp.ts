import { calculateMvpScore, getGameMvpParticipant } from "@/lib/mvp";

type GameParticipantForMvp = {
  playerId: number;
  kills: number;
  deaths: number;
  assists: number;
  team: string;
};

export function getStoredGameMvpFields(
  participants: GameParticipantForMvp[],
  winnerTeam: string,
) {
  const mvp = getGameMvpParticipant(participants, winnerTeam);

  if (!mvp) {
    return {
      mvpPlayerId: null,
      mvpScore: null,
    };
  }

  return {
    mvpPlayerId: mvp.playerId,
    mvpScore: calculateMvpScore(mvp),
  };
}
