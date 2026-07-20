export type MvpVoteResolution =
  | { status: "PENDING"; voteCount: number }
  | { status: "FINALIZED"; mvpPlayerId: number; voteCount: number }
  | { status: "REVOTE"; candidatePlayerIds: number[]; voteCount: number };

export function resolveMvpVotes(candidatePlayerIds: number[], requiredVoteCount = 10): MvpVoteResolution {
  if (candidatePlayerIds.length < requiredVoteCount) {
    return { status: "PENDING", voteCount: candidatePlayerIds.length };
  }

  const counts = new Map<number, number>();
  for (const playerId of candidatePlayerIds) {
    counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  }

  const highest = Math.max(...counts.values());
  const leaders = [...counts.entries()]
    .filter(([, count]) => count === highest)
    .map(([playerId]) => playerId)
    .sort((a, b) => a - b);

  if (leaders.length === 1) {
    return { status: "FINALIZED", mvpPlayerId: leaders[0], voteCount: candidatePlayerIds.length };
  }

  return { status: "REVOTE", candidatePlayerIds: leaders, voteCount: candidatePlayerIds.length };
}
