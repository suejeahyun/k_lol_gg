export type MvpParticipantInput = {
  playerId: number;
  kills: number;
  deaths: number;
  assists: number;
  team: string;
};

export function calculateMvpScore(participant: MvpParticipantInput) {
  return (
    participant.kills * 3 +
    participant.assists * 1.5 -
    participant.deaths * 2 +
    5
  );
}

export function getGameMvpParticipant<T extends MvpParticipantInput>(
  participants: T[],
  winnerTeam: string,
): T | null {
  const winnerParticipants = participants.filter(
    (participant) => participant.team === winnerTeam,
  );

  if (winnerParticipants.length === 0) return null;

  return [...winnerParticipants].sort((a, b) => {
    const scoreDiff = calculateMvpScore(b) - calculateMvpScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (a.deaths !== b.deaths) return a.deaths - b.deaths;
    if (b.assists !== a.assists) return b.assists - a.assists;
    return a.playerId - b.playerId;
  })[0];
}

export function getGameMvpPlayerId(
  participants: MvpParticipantInput[],
  winnerTeam: string,
) {
  return getGameMvpParticipant(participants, winnerTeam)?.playerId ?? null;
}
