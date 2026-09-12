import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type { PublicRankingRowDto, StatisticsPosition } from "../../domain/season-statistics";

export type PublicStatisticsSeason = Readonly<{
  id: string;
  name: string;
  status: "ACTIVE" | "ENDED";
}>;

export type StatisticsProjectionSummary = Readonly<{
  status: "EMPTY" | "READY";
  generation: number;
  sourceMatchCount: number;
  sourceGameCount: number;
  sourceParticipantCount: number;
  calculatedAt: string | null;
}>;

export type PublicSeasonRanking = Readonly<{
  season: PublicStatisticsSeason | null;
  projection: StatisticsProjectionSummary | null;
  minimumParticipation: number;
  rankings: readonly PublicRankingRowDto[];
}>;

export type PublicPlayerStatistics = Readonly<{
  player: Readonly<{ id: string; displayName: string; riotId: string }>;
  season: PublicStatisticsSeason | null;
  projection: StatisticsProjectionSummary | null;
  summary: Readonly<{
    totalGames: number;
    participationCount: number;
    wins: number;
    losses: number;
    winRate: number;
    mvpCount: number;
  }>;
  performance: Readonly<{
    gameCount: number;
    averageKills: number | null;
    averageDeaths: number | null;
    averageAssists: number | null;
    averageKda: number | null;
    averageBalanceScore: number | null;
    assignmentGames: Readonly<{
      main: number;
      sub: number;
      all: number;
      nonPreferred: number;
      unclassified: number;
    }>;
  }>;
  champions: readonly Readonly<{
    championKey: string;
    championName: string;
    championImageUrl: string | null;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    mvpCount: number;
  }>[];
  positions: readonly Readonly<{
    position: StatisticsPosition;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
  }>[];
  recentMatches: readonly Readonly<{
    matchId: string;
    title: string;
    playedOn: string;
    gameNumber: number;
    championKey: string;
    championName: string;
    championImageUrl: string | null;
    team: "BLUE" | "RED";
    position: StatisticsPosition;
    won: boolean;
    mvp: boolean;
  }>[];
}>;

export type AdminStatisticsSeasonStatus = Readonly<{
  season: Readonly<{
    id: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "ENDED" | "RETIRED";
  }>;
  projection: StatisticsProjectionSummary;
  pendingEventCount: number;
  failedEventCount: number;
  lastFailureCode: string | null;
}>;

export type AdminStatisticsStatus = Readonly<{
  seasons: readonly AdminStatisticsSeasonStatus[];
  pendingEventCount: number;
  failedEventCount: number;
}>;

export interface StatisticsQueryRepository {
  listPublicSeasons(): Promise<readonly PublicStatisticsSeason[]>;
  findPublicPlayerIdForAccount(userAccountId: string): Promise<string | null>;
  getPublicSeasonRanking(
    seasonId: string | null,
    minimumParticipation: number,
  ): Promise<PublicSeasonRanking>;
  getPublicPlayerStatistics(
    playerId: string,
    seasonId: string | null,
  ): Promise<PublicPlayerStatistics | null>;
  getAdminStatus(seasonId: string | null): Promise<AdminStatisticsStatus>;
}

export type StatisticsCommandEnvelope = Readonly<{
  actorSession: TransactionSessionActor;
  requestId: string;
  scope: "admin:statistics:recalculate";
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type StatisticsRecalculationResult = Readonly<{
  body: Readonly<{
    seasonId: string;
    generation: number;
    sourceMatchCount: number;
    sourceGameCount: number;
    sourceParticipantCount: number;
    sourceChecksum: string;
  }>;
  status: 200;
  revision: number;
  replayed: boolean;
}>;

export interface StatisticsCommandRepository {
  recalculateSeason(
    envelope: StatisticsCommandEnvelope,
    seasonId: string,
    expectedGeneration: number,
    now: Date,
  ): Promise<StatisticsRecalculationResult>;
}
