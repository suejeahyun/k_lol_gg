import { canonicalIdentifier, requireCompetition } from "./error";

export type BestOfResultInput = Readonly<{
  bestOf: number;
  teamAId: string;
  teamBId: string;
  teamAScore: number;
  teamBScore: number;
  winnerTeamId: string;
}>;

export type BestOfResult = BestOfResultInput & Readonly<{ requiredWins: number }>;

export function validateBestOf(bestOf: number) {
  requireCompetition(
    Number.isSafeInteger(bestOf) && bestOf >= 1 && bestOf <= 9 && bestOf % 2 === 1,
    "INVALID_RESULT",
    "bestOf must be an odd integer between 1 and 9.",
  );
  return bestOf;
}

export function validateBestOfResult(input: BestOfResultInput): BestOfResult {
  const bestOf = validateBestOf(input.bestOf);
  canonicalIdentifier(input.teamAId, "teamAId");
  canonicalIdentifier(input.teamBId, "teamBId");
  canonicalIdentifier(input.winnerTeamId, "winnerTeamId");
  requireCompetition(input.teamAId !== input.teamBId, "INVALID_RESULT", "A team cannot play itself.");
  requireCompetition(
    Number.isSafeInteger(input.teamAScore) && input.teamAScore >= 0 &&
      Number.isSafeInteger(input.teamBScore) && input.teamBScore >= 0,
    "INVALID_RESULT",
    "Scores must be non-negative safe integers.",
  );
  const requiredWins = Math.floor(bestOf / 2) + 1;
  const winningScore = Math.max(input.teamAScore, input.teamBScore);
  const losingScore = Math.min(input.teamAScore, input.teamBScore);
  const scoreWinner = input.teamAScore > input.teamBScore ? input.teamAId : input.teamBId;
  requireCompetition(
    input.teamAScore !== input.teamBScore &&
      winningScore === requiredWins &&
      losingScore < requiredWins &&
      input.teamAScore + input.teamBScore <= bestOf,
    "INVALID_RESULT",
    "The score is not a completed best-of series.",
  );
  requireCompetition(scoreWinner === input.winnerTeamId, "INVALID_RESULT", "winnerTeamId contradicts the score.");
  return Object.freeze({ ...input, bestOf, requiredWins });
}
