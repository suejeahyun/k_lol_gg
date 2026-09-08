import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  championCatalog,
  playerChampionStats,
  seasonProjectionStates,
  seasons,
  teamBalanceDraftCandidates,
  teamBalanceDraftParticipants,
  teamBalanceDrafts,
} from "@/platform/db/schema";
import type { V2Database } from "@/platform/db/database";

import type { TeamBalanceRecommendationRepository } from "../application/ports/team-balance-recommendation-repository";
import type { TeamBalanceViewer } from "../application/ports/team-balance-repository";
import type { TeamBalanceLayoutEntry, TeamBalanceTeam } from "../domain/team-balance";
import { TeamBalanceServiceError } from "../domain/team-balance-draft";
import {
  buildTeamBalanceRecommendation,
  type TeamRecommendationAssignment,
} from "../domain/team-recommendations";

export class PostgresTeamBalanceRecommendationRepository implements TeamBalanceRecommendationRepository {
  constructor(private readonly database: V2Database) {}

  async getRecommendation(viewer: TeamBalanceViewer, draftId: string, team: TeamBalanceTeam) {
    const draft = (await this.database.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId)).limit(1))[0];
    if (!draft || (viewer.authorization === "OWNER" && (
      draft.ownerUserAccountId !== viewer.actorUserAccountId || draft.status === "ARCHIVED"
    ))) {
      throw new TeamBalanceServiceError("NOT_FOUND", "팀 초안을 찾을 수 없습니다.");
    }
    const draftDto = Object.freeze({
      id: draft.id,
      title: draft.title,
      status: draft.status,
      revision: draft.revision,
    });
    if (!draft.selectedCandidateSignature) {
      return buildTeamBalanceRecommendation({ draft: draftDto, projection: null, assignments: null, championStats: [], team });
    }

    const [candidate, participantRows] = await Promise.all([
      this.database.select({ assignmentsJson: teamBalanceDraftCandidates.assignmentsJson })
        .from(teamBalanceDraftCandidates)
        .where(and(
          eq(teamBalanceDraftCandidates.draftId, draft.id),
          eq(teamBalanceDraftCandidates.evaluationRound, draft.evaluationRound),
          eq(teamBalanceDraftCandidates.signature, draft.selectedCandidateSignature),
        )).limit(1).then((rows) => rows[0] ?? null),
      this.database.select({ playerId: teamBalanceDraftParticipants.playerId, displayName: teamBalanceDraftParticipants.displayNameSnapshot })
        .from(teamBalanceDraftParticipants).where(eq(teamBalanceDraftParticipants.draftId, draft.id)),
    ]);
    if (!candidate) throw new Error("SELECTED_TEAM_BALANCE_CANDIDATE_MISSING");
    const displayNameByPlayer = new Map(participantRows.map((row) => [row.playerId, row.displayName]));
    const assignments = (candidate.assignmentsJson as unknown as readonly TeamBalanceLayoutEntry[]).map((entry) => ({
      playerId: entry.playerId,
      displayName: displayNameByPlayer.get(entry.playerId) ?? "알 수 없는 플레이어",
      team: entry.team,
      position: entry.position,
    } satisfies TeamRecommendationAssignment));

    const projection = (await this.database.select({
      seasonId: seasonProjectionStates.seasonId,
      seasonName: seasons.name,
      generation: seasonProjectionStates.generation,
      calculatedAt: seasonProjectionStates.calculatedAt,
    }).from(seasonProjectionStates)
      .innerJoin(seasons, eq(seasons.id, seasonProjectionStates.seasonId))
      .where(and(eq(seasonProjectionStates.status, "READY"), inArray(seasons.status, ["ACTIVE", "ENDED"])))
      .orderBy(
        sql`CASE WHEN ${seasons.status} = 'ACTIVE' THEN 0 ELSE 1 END`,
        desc(seasonProjectionStates.calculatedAt),
        desc(seasons.createdAt),
        asc(seasons.id),
      ).limit(1))[0] ?? null;
    if (!projection || !projection.calculatedAt) {
      return buildTeamBalanceRecommendation({ draft: draftDto, projection: null, assignments, championStats: [], team });
    }

    const playerIds = assignments.map((entry) => entry.playerId);
    const championStats = await this.database.select({
      playerId: playerChampionStats.playerId,
      championKey: playerChampionStats.championKey,
      championName: championCatalog.displayName,
      games: playerChampionStats.games,
      wins: playerChampionStats.wins,
      losses: playerChampionStats.losses,
      mvpCount: playerChampionStats.mvpCount,
    }).from(playerChampionStats)
      .innerJoin(championCatalog, and(
        eq(championCatalog.key, playerChampionStats.championKey),
        eq(championCatalog.status, "ACTIVE"),
      )).where(and(
        eq(playerChampionStats.seasonId, projection.seasonId),
        eq(playerChampionStats.generation, projection.generation),
        inArray(playerChampionStats.playerId, playerIds),
      ));

    return buildTeamBalanceRecommendation({
      draft: draftDto,
      projection: {
        seasonId: projection.seasonId,
        seasonName: projection.seasonName,
        generation: projection.generation,
        calculatedAt: projection.calculatedAt.toISOString(),
      },
      assignments,
      championStats,
      team,
    });
  }
}
