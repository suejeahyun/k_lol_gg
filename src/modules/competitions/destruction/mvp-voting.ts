import { canonicalIdentifier, compareCanonicalIdentifiers, requireCompetition } from "../core/error";

export type DestructionMvpVote = Readonly<{ voterPlayerId: string; candidatePlayerId: string }>;
export type DestructionMvpBallot = Readonly<{
  fixtureId: string;
  participantPlayerIds: readonly string[];
  round: number;
  candidatePlayerIds: readonly string[];
  votes: readonly DestructionMvpVote[];
  finalizedPlayerId: string | null;
  selectionMethod: "VOTE" | "ADMIN" | null;
  finalizedAt: string | null;
}>;

function validateBallot(ballot: DestructionMvpBallot) {
  canonicalIdentifier(ballot.fixtureId, "fixtureId");
  requireCompetition(ballot.participantPlayerIds.length === 10 && new Set(ballot.participantPlayerIds).size === 10, "PRECONDITION_FAILED", "MVP voting requires the fixture's ten-player roster snapshot.");
  requireCompetition(Number.isSafeInteger(ballot.round) && ballot.round >= 1, "PRECONDITION_FAILED", "MVP vote rounds are positive integers.");
  const participants = new Set(ballot.participantPlayerIds);
  requireCompetition(ballot.candidatePlayerIds.length >= 1 && ballot.candidatePlayerIds.every((id) => participants.has(id)), "PRECONDITION_FAILED", "Every MVP candidate must belong to the fixture roster snapshot.");
  requireCompetition(new Set(ballot.candidatePlayerIds).size === ballot.candidatePlayerIds.length, "DUPLICATE_ID", "MVP candidates must be unique.");
  requireCompetition(new Set(ballot.votes.map((vote) => vote.voterPlayerId)).size === ballot.votes.length && ballot.votes.length <= 10, "DUPLICATE_ID", "Each participant has at most one current-round vote.");
  for (const vote of ballot.votes) {
    requireCompetition(participants.has(vote.voterPlayerId) && ballot.candidatePlayerIds.includes(vote.candidatePlayerId), "PRECONDITION_FAILED", "Votes must use an eligible fixture participant and current-round candidate.");
    requireCompetition(vote.voterPlayerId !== vote.candidatePlayerId, "PRECONDITION_FAILED", "A participant cannot vote for themselves.");
  }
  requireCompetition(
    ballot.finalizedPlayerId === null
      ? ballot.selectionMethod === null && ballot.finalizedAt === null
      : participants.has(ballot.finalizedPlayerId) && ballot.selectionMethod !== null && ballot.finalizedAt !== null,
    "PRECONDITION_FAILED",
    "Finalized MVP state is inconsistent.",
  );
}
export function createDestructionMvpBallot(fixtureId: string, participantPlayerIds: readonly string[]): DestructionMvpBallot {
  const ballot = Object.freeze({
    fixtureId,
    participantPlayerIds: Object.freeze([...participantPlayerIds].sort(compareCanonicalIdentifiers)),
    round: 1,
    candidatePlayerIds: Object.freeze([...participantPlayerIds].sort(compareCanonicalIdentifiers)),
    votes: Object.freeze([]),
    finalizedPlayerId: null,
    selectionMethod: null,
    finalizedAt: null,
  });
  validateBallot(ballot);
  return ballot;
}

export type DestructionMvpVoteResult = Readonly<{
  ballot: DestructionMvpBallot;
  status: "VOTED" | "REVOTE" | "FINALIZED";
}>;

export function castDestructionMvpVote(
  ballot: DestructionMvpBallot,
  vote: DestructionMvpVote,
  finalizedAt: string,
): DestructionMvpVoteResult {
  validateBallot(ballot);
  requireCompetition(ballot.finalizedPlayerId === null, "INVALID_TRANSITION", "The MVP has already been finalized.");
  requireCompetition(ballot.participantPlayerIds.includes(vote.voterPlayerId), "PRECONDITION_FAILED", "Only fixture participants may vote.");
  requireCompetition(ballot.candidatePlayerIds.includes(vote.candidatePlayerId), "PRECONDITION_FAILED", "The selected player is not a current-round candidate.");
  requireCompetition(vote.voterPlayerId !== vote.candidatePlayerId, "PRECONDITION_FAILED", "A participant cannot vote for themselves.");
  const votes = Object.freeze([...ballot.votes.filter((entry) => entry.voterPlayerId !== vote.voterPlayerId), Object.freeze({ ...vote })]
    .sort((left, right) => compareCanonicalIdentifiers(left.voterPlayerId, right.voterPlayerId)));
  if (votes.length < 10) return Object.freeze({ ballot: Object.freeze({ ...ballot, votes }), status: "VOTED" });

  const counts = new Map<string, number>();
  for (const entry of votes) counts.set(entry.candidatePlayerId, (counts.get(entry.candidatePlayerId) ?? 0) + 1);
  const highest = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, count]) => count === highest).map(([id]) => id).sort(compareCanonicalIdentifiers);
  if (leaders.length === 1) {
    const time = Date.parse(finalizedAt);
    requireCompetition(Number.isFinite(time) && new Date(time).toISOString() === finalizedAt, "PRECONDITION_FAILED", "MVP finalizedAt must be a canonical ISO instant.");
    return Object.freeze({ ballot: Object.freeze({ ...ballot, votes, finalizedPlayerId: leaders[0]!, selectionMethod: "VOTE", finalizedAt }), status: "FINALIZED" });
  }
  return Object.freeze({
    ballot: Object.freeze({ ...ballot, round: ballot.round + 1, candidatePlayerIds: Object.freeze(leaders), votes: Object.freeze([]) }),
    status: "REVOTE",
  });
}

export function assignDestructionMvp(ballot: DestructionMvpBallot, playerId: string, finalizedAt: string) {
  validateBallot(ballot);
  requireCompetition(ballot.participantPlayerIds.includes(playerId), "PRECONDITION_FAILED", "An administrator may only select a fixture participant.");
  const time = Date.parse(finalizedAt);
  requireCompetition(Number.isFinite(time) && new Date(time).toISOString() === finalizedAt, "PRECONDITION_FAILED", "MVP finalizedAt must be a canonical ISO instant.");
  return Object.freeze({ ...ballot, candidatePlayerIds: Object.freeze([...ballot.candidatePlayerIds]), votes: Object.freeze([...ballot.votes]), finalizedPlayerId: playerId, selectionMethod: "ADMIN" as const, finalizedAt });
}

export function resetDestructionMvp(ballot: DestructionMvpBallot) {
  validateBallot(ballot);
  requireCompetition(ballot.finalizedPlayerId !== null || ballot.votes.length > 0 || ballot.round > 1, "INVALID_TRANSITION", "There is no MVP state to reset.");
  return createDestructionMvpBallot(ballot.fixtureId, ballot.participantPlayerIds);
}
