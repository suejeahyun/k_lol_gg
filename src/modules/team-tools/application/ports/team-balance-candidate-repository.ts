import type { SeasonApplicationPosition, SeasonApplicationSource } from "@/modules/seasons";

export type TeamBalanceCandidatePlayer = Readonly<{
  playerId: string;
  displayName: string;
  riotId: string;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  source: SeasonApplicationSource;
}>;

export type TeamBalanceCandidateGroup = Readonly<{
  key: string;
  seasonId: string;
  seasonName: string;
  applyDate: string;
  recruitNo: number;
  sources: readonly SeasonApplicationSource[];
  players: readonly TeamBalanceCandidatePlayer[];
}>;

export type TeamBalanceCandidateGroups = Readonly<{
  groups: readonly TeamBalanceCandidateGroup[];
  truncated: boolean;
}>;

export type TeamBalancePlayerSearch = Readonly<{
  players: readonly Pick<TeamBalanceCandidatePlayer, "playerId" | "displayName" | "riotId">[];
  hasMore: boolean;
}>;

export interface TeamBalanceCandidateRepository {
  searchPlayers(query: string): Promise<TeamBalancePlayerSearch>;
  listSeasonGroups(input: Readonly<{
    origin: "ALL" | SeasonApplicationSource;
    days: number;
    now: Date;
  }>): Promise<TeamBalanceCandidateGroups>;
}
