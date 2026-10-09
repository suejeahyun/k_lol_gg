import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { playerTierFamily, playerTierFilters } from "@/modules/players/domain/player-tier";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { players } from "@/platform/db/schema/registry";
import { teamBalancePlayerOverrides } from "@/platform/db/schema/team-tools";
import type { V2Transaction } from "@/platform/db/transaction";

import type { TeamBalanceRatingProvider } from "../application/ports/team-balance-rating-provider";
import type {
  TeamScoreHistoryItem,
  TeamScoreOverview,
  TeamScorePlayer,
  TeamScorePlayerDetail,
  TeamScoreQuery,
  TeamScoreResponse,
  TeamScoreTier,
} from "../application/team-score-query";
import {
  evaluateTeamBalancePlayerScore,
  TEAM_BALANCE_POSITIONS,
  TEAM_BALANCE_V1_FORMULA_VERSION,
  type TeamBalanceRatingProviderDto,
} from "../domain/team-balance";
import { TeamBalanceServiceError } from "../domain/team-balance-draft";
import { PostgresTeamBalanceRatingProvider } from "./postgres-team-balance-rating-provider";

const RATING_BATCH_SIZE = 200;
const MAXIMUM_STATISTICS_PLAYERS = 10_000;
const playerFields = {
  playerId: players.id,
  displayName: players.memberName,
  nickname: players.nickname,
  tagLine: players.tagLine,
  currentTier: players.currentTier,
  peakTier: players.peakTier,
};
type PlayerRow = { playerId: string; displayName: string; nickname: string; tagLine: string; currentTier: string | null; peakTier: string | null };

function playerDto(row: PlayerRow): TeamScorePlayer {
  return { playerId: row.playerId, displayName: row.displayName, riotId: `${row.nickname}#${row.tagLine}`, currentTier: row.currentTier, peakTier: row.peakTier };
}

function breakdown(playerId: string, rating: TeamBalanceRatingProviderDto | null) {
  return evaluateTeamBalancePlayerScore({ playerId, rating, eligiblePositions: TEAM_BALANCE_POSITIONS.map((position) => ({ position, preference: "MAIN" })) });
}

function auditValues(row: { beforeJson: Record<string, unknown> | null; afterJson: Record<string, unknown> | null }) {
  const after = row.afterJson;
  const beforeScore = row.beforeJson?.score;
  if (!after || !Number.isSafeInteger(after.score) || !Number.isSafeInteger(after.revision) || typeof after.reason !== "string" ||
    (row.beforeJson !== null && !Number.isSafeInteger(beforeScore))) throw new Error("Invalid stored team score audit record.");
  return { beforeScore: row.beforeJson === null ? null : Number(beforeScore), afterScore: Number(after.score), reason: after.reason, revision: Number(after.revision) };
}

function tierKey(value: string | null): TeamScoreTier["tier"] {
  const family = playerTierFamily(value);
  if (family) return family;
  return !value?.trim() || /^(?:UNRANKED|UNRANK|언랭|배치|미등록)$/iu.test(value.normalize("NFKC").trim()) ? "UNRANKED" : "UNKNOWN";
}

function tierStatistics(rows: readonly PlayerRow[], scores: ReadonlyMap<string, number>): readonly TeamScoreTier[] {
  const groups = new Map<TeamScoreTier["tier"], number[]>();
  for (const row of rows) {
    const key = tierKey(row.currentTier);
    const values = groups.get(key) ?? [];
    const score = scores.get(row.playerId);
    if (score === undefined) throw new Error("Missing active player team score.");
    values.push(score);
    groups.set(key, values);
  }
  return [...playerTierFilters.map((tier) => ({ tier: tier.value, tierLabel: tier.label })),
    { tier: "UNRANKED" as const, tierLabel: "미등록·언랭" }, { tier: "UNKNOWN" as const, tierLabel: "기타 티어" },
  ].map((tier) => {
    const values = (groups.get(tier.tier) ?? []).sort((left, right) => left - right);
    const middle = Math.floor(values.length / 2);
    const rounded = (value: number) => Math.round(value * 100) / 100;
    return { ...tier, playerCount: values.length,
      averageBaseScore: values.length ? rounded(values.reduce((total, value) => total + value, 0) / values.length) : null,
      medianBaseScore: values.length ? rounded(values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2) : null };
  });
}

export class PostgresTeamScoreRepository {
  constructor(
    private readonly database: V2Database,
    private readonly ratingProvider?: TeamBalanceRatingProvider,
  ) {}

  async read(query: TeamScoreQuery): Promise<TeamScoreResponse> {
    const now = new Date();
    const ratingProvider = this.ratingProvider ?? new PostgresTeamBalanceRatingProvider(() => now);
    // Count, history and provider batches must share the same projection and override snapshot.
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`set local statement_timeout = '15s'`);
      return query.playerId ? this.player(transaction, query.playerId, query, ratingProvider) : this.overview(transaction, query, ratingProvider);
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  private async player(transaction: V2Transaction, playerId: string, query: TeamScoreQuery, ratingProvider: TeamBalanceRatingProvider): Promise<TeamScorePlayerDetail> {
    const row = (await transaction.select(playerFields).from(players)
      .where(and(eq(players.id, playerId), eq(players.status, "ACTIVE"))).limit(1))[0];
    if (!row) throw new TeamBalanceServiceError("NOT_FOUND", "활성 플레이어를 찾을 수 없습니다.");
    const current = (await transaction.select().from(teamBalancePlayerOverrides).where(eq(teamBalancePlayerOverrides.playerId, playerId)).limit(1))[0];
    const snapshot = await ratingProvider.load(transaction, [playerId]);
    const actor = alias(players, "team_score_audit_actor");
    const historyWhere = and(eq(auditEvents.action, "TEAM_BALANCE_OVERRIDE_SET"), eq(auditEvents.targetType, "TEAM_BALANCE_PLAYER_OVERRIDE"), eq(auditEvents.targetId, playerId));
    const total = (await transaction.select({ value: count() }).from(auditEvents).where(historyWhere))[0]?.value ?? 0;
    const historyRows = await transaction.select({ id: auditEvents.id, actorId: auditEvents.actorUserAccountId, actorLabel: actor.memberName,
      beforeJson: auditEvents.beforeJson, afterJson: auditEvents.afterJson, createdAt: auditEvents.createdAt })
      .from(auditEvents).leftJoin(actor, eq(actor.userAccountId, auditEvents.actorUserAccountId)).where(historyWhere)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const items: TeamScoreHistoryItem[] = historyRows.map((history) => ({ id: history.id,
      actorLabel: history.actorLabel ?? (history.actorId ? `관리자 ${history.actorId.slice(0, 8)}` : "삭제된 관리자"), ...auditValues(history), createdAt: history.createdAt.toISOString() }));
    return {
      kind: "player", player: playerDto(row),
      override: { playerId, score: current?.score ?? 0, reason: current?.reason ?? "", revision: current?.revision ?? 0,
        configured: Boolean(current), updatedAt: current?.updatedAt.toISOString() ?? null },
      breakdown: breakdown(playerId, snapshot.ratings.get(playerId) ?? null), previewPreference: "MAIN",
      history: { items, total, page: query.page, pageSize: query.pageSize }, ratingGeneration: snapshot.generation, formulaVersion: TEAM_BALANCE_V1_FORMULA_VERSION,
    };
  }

  private async overview(transaction: V2Transaction, query: TeamScoreQuery, ratingProvider: TeamBalanceRatingProvider): Promise<TeamScoreOverview> {
    const activeRows = await transaction.select(playerFields).from(players).where(eq(players.status, "ACTIVE"))
      .orderBy(asc(players.id)).limit(MAXIMUM_STATISTICS_PLAYERS + 1);
    if (activeRows.length > MAXIMUM_STATISTICS_PLAYERS) throw new Error("Team score statistics capacity exceeded.");
    const scores = new Map<string, number>();
    let ratingGeneration: number | null = null;
    for (let offset = 0; offset < activeRows.length; offset += RATING_BATCH_SIZE) {
      const batch = activeRows.slice(offset, offset + RATING_BATCH_SIZE);
      const snapshot = await ratingProvider.load(transaction, batch.map((row) => row.playerId));
      if (offset > 0 && snapshot.generation !== ratingGeneration) throw new Error("Inconsistent team score rating generation.");
      ratingGeneration = snapshot.generation;
      for (const row of batch) scores.set(row.playerId, breakdown(row.playerId, snapshot.ratings.get(row.playerId) ?? null).baseScore);
    }
    const normalized = query.query.toLocaleLowerCase("ko-KR");
    const prefix = `${normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const configuredWhere = and(eq(players.status, "ACTIVE"), normalized ? or(like(players.memberNameNormalized, prefix),
      like(players.nicknameNormalized, prefix), like(sql<string>`${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`, prefix)) : undefined);
    const total = (await transaction.select({ value: count() }).from(teamBalancePlayerOverrides)
      .innerJoin(players, eq(players.id, teamBalancePlayerOverrides.playerId)).where(configuredWhere))[0]?.value ?? 0;
    const configured = await transaction.select({ ...playerFields, score: teamBalancePlayerOverrides.score, reason: teamBalancePlayerOverrides.reason,
      revision: teamBalancePlayerOverrides.revision, updatedAt: teamBalancePlayerOverrides.updatedAt }).from(teamBalancePlayerOverrides)
      .innerJoin(players, eq(players.id, teamBalancePlayerOverrides.playerId)).where(configuredWhere)
      .orderBy(desc(teamBalancePlayerOverrides.updatedAt), asc(players.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return { kind: "overview", configured: { items: configured.map((row) => ({ ...playerDto(row), score: row.score, reason: row.reason,
      revision: row.revision, updatedAt: row.updatedAt.toISOString(), baseScore: scores.get(row.playerId)! })), total, page: query.page, pageSize: query.pageSize },
      tiers: tierStatistics(activeRows, scores), activePlayerCount: activeRows.length, scoreBasis: "ACTIVE_REGISTERED_PLAYERS_BASE_SCORE",
      ratingGeneration, formulaVersion: TEAM_BALANCE_V1_FORMULA_VERSION };
  }
}
