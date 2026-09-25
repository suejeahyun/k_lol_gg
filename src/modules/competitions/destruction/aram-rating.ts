import { requireCompetition } from "../core/error";

export const DESTRUCTION_GAME_MODES = { CLASSIC: "소환사의 협곡", ARAM: "칼바람", ARAM_MAYHEM: "증바람" } as const;
export type DestructionGameMode = keyof typeof DESTRUCTION_GAME_MODES;
export type AramRecord = Readonly<{
  mode: "ARAM" | "ARAM_MAYHEM";
  source: "RIOT" | "ADMIN_VERIFIED";
  wins: number;
  losses: number;
  fetchedAt: string;
  evidence: string;
}>;
export type AramCollection = Readonly<{
  linkId: string;
  linkRevision: number;
  matchIds: readonly string[];
  processed: number;
  wins: number;
  losses: number;
  excluded: number;
  startedAt: string;
}>;

/** Tournament-only valuation, never an estimate of Riot MMR or ranked tier. */
export function aramAuctionRating(record: AramRecord) {
  const games = record.wins + record.losses;
  requireCompetition([record.wins, record.losses].every((n) => Number.isSafeInteger(n) && n >= 0) && games >= 1 && games <= 100, "PRECONDITION_FAILED", "최근 최대 100판의 유효한 승패가 필요합니다.");
  // Twenty neutral prior games prevent a very small sample from dominating the auction.
  const adjustedWinRate = (record.wins + 10) / (games + 20);
  const tier = games < 20 ? "B" : adjustedWinRate >= 0.6 ? "S" : adjustedWinRate >= 0.525 ? "A" : adjustedWinRate >= 0.475 ? "B" : adjustedWinRate >= 0.4 ? "C" : "D";
  const minimumBid = { S: 300, A: 250, B: 200, C: 150, D: 100 }[tier];
  return { tier, minimumBid, captainPoints: 2_000 - minimumBid, games, wins: record.wins, losses: record.losses, provisional: games < 50, formulaVersion: "ARAM_AUCTION_V1" as const };
}

export class AramSyncError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "MAYHEM_UNSUPPORTED" | "NOT_CONNECTED" | "RATE_LIMITED" | "INVALID_RESPONSE" | "NO_MATCHES" | "ACCOUNT_CHANGED", readonly retryAfterSeconds = 0) { super(code); }
}
