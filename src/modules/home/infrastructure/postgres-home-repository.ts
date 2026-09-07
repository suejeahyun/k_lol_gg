import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { destructionCompetitions } from "@/platform/db/schema/destruction-competitions";
import { eventCompetitions } from "@/platform/db/schema/event-competitions";
import { mediaGalleries } from "@/platform/db/schema/media";
import { matchSeries } from "@/platform/db/schema/matches";
import { recruitParties, scrimRecruits } from "@/platform/db/schema/recruiting";
import { players } from "@/platform/db/schema/registry";
import { seasons } from "@/platform/db/schema/seasons";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { HomeRepository } from "../application/ports/home-repository";
import {
  mergeRecentHomeItems,
  type HomeCompetition,
  type HomeRecruit,
  type HomeSnapshot,
} from "../domain/home-snapshot";

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export class PostgresHomeRepository implements HomeRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async load(): Promise<HomeSnapshot> {
    const [
      playerRows,
      seasonRows,
      matchRows,
      activeSeasonRows,
      recentMatchRows,
      partyRows,
      scrimRows,
      eventRows,
      destructionRows,
      galleryRows,
    ] = await Promise.all([
      this.database.select({ value: count() }).from(players).where(eq(players.status, "ACTIVE")),
      this.database.select({ value: count() }).from(seasons).where(eq(seasons.status, "ACTIVE")),
      this.database.select({ value: count() }).from(matchSeries).where(eq(matchSeries.status, "PUBLISHED")),
      this.database.select({ id: seasons.id, name: seasons.name, startsAt: seasons.startsAt, endsAt: seasons.endsAt })
        .from(seasons).where(eq(seasons.status, "ACTIVE")).limit(1),
      this.database.select({
        id: matchSeries.id,
        title: matchSeries.title,
        playedOn: matchSeries.playedOn,
        blueWins: matchSeries.blueWins,
        redWins: matchSeries.redWins,
        publishedAt: matchSeries.publishedAt,
      }).from(matchSeries).where(eq(matchSeries.status, "PUBLISHED"))
        .orderBy(desc(matchSeries.playedOn), desc(matchSeries.publishedAt), desc(matchSeries.id)).limit(4),
      this.database.select({
        id: recruitParties.id,
        title: recruitParties.title,
        status: recruitParties.status,
        maximumMembers: recruitParties.maximumMembers,
        memberCount: sql<number>`jsonb_array_length(${recruitParties.membersJson})`,
        updatedAt: recruitParties.updatedAt,
      }).from(recruitParties).where(eq(recruitParties.status, "IN_PROGRESS"))
        .orderBy(desc(recruitParties.updatedAt), desc(recruitParties.id)).limit(4),
      this.database.select({
        id: scrimRecruits.id,
        status: scrimRecruits.status,
        scrimNumber: scrimRecruits.scrimNumber,
        bestOf: scrimRecruits.bestOf,
        updatedAt: scrimRecruits.updatedAt,
      }).from(scrimRecruits).where(inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]))
        .orderBy(desc(scrimRecruits.updatedAt), desc(scrimRecruits.id)).limit(4),
      this.database.select({
        id: eventCompetitions.id,
        title: eventCompetitions.title,
        status: eventCompetitions.status,
        participantCount: eventCompetitions.activeParticipantCount,
        updatedAt: eventCompetitions.updatedAt,
      }).from(eventCompetitions).where(inArray(eventCompetitions.status, ["PLANNED", "RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED"]))
        .orderBy(desc(eventCompetitions.updatedAt), desc(eventCompetitions.id)).limit(4),
      this.database.select({
        id: destructionCompetitions.id,
        title: destructionCompetitions.title,
        status: destructionCompetitions.status,
        participantCount: destructionCompetitions.participantCount,
        updatedAt: destructionCompetitions.updatedAt,
      }).from(destructionCompetitions).where(inArray(destructionCompetitions.status, ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"]))
        .orderBy(desc(destructionCompetitions.updatedAt), desc(destructionCompetitions.id)).limit(4),
      this.database.select({
        id: mediaGalleries.id,
        title: mediaGalleries.title,
        description: mediaGalleries.description,
        publishedAt: mediaGalleries.publishedAt,
      }).from(mediaGalleries).where(and(eq(mediaGalleries.status, "PUBLISHED"), eq(mediaGalleries.showOnHome, true)))
        .orderBy(desc(mediaGalleries.publishedAt), desc(mediaGalleries.id)).limit(3),
    ]);

    const activeSeason = activeSeasonRows[0];
    const recruits = mergeRecentHomeItems<HomeRecruit>([
      partyRows.map((row) => ({
        id: row.id,
        kind: "PARTY" as const,
        title: row.title,
        status: row.status,
        summary: `${row.memberCount}/${row.maximumMembers}명 참여`,
        occurredAt: row.updatedAt.toISOString(),
      })),
      scrimRows.map((row) => ({
        id: row.id,
        kind: "SCRIM" as const,
        title: `스크림 #${row.scrimNumber}`,
        status: row.status,
        summary: `BO${row.bestOf} 상대 팀 모집`,
        occurredAt: row.updatedAt.toISOString(),
      })),
    ], 4);

    const competitions = mergeRecentHomeItems<HomeCompetition>([
      eventRows.map((row) => ({
        id: row.id,
        kind: "EVENT" as const,
        title: row.title,
        status: row.status,
        participantCount: row.participantCount,
        occurredAt: row.updatedAt.toISOString(),
      })),
      destructionRows.map((row) => ({
        id: row.id,
        kind: "DESTRUCTION" as const,
        title: row.title,
        status: row.status,
        participantCount: row.participantCount,
        occurredAt: row.updatedAt.toISOString(),
      })),
    ], 4);

    return {
      activePlayerCount: playerRows[0]?.value ?? 0,
      activeSeasonCount: seasonRows[0]?.value ?? 0,
      publishedMatchCount: matchRows[0]?.value ?? 0,
      activeSeason: activeSeason ? {
        id: activeSeason.id,
        name: activeSeason.name,
        startsAt: iso(activeSeason.startsAt),
        endsAt: iso(activeSeason.endsAt),
      } : null,
      feeds: {
        recentMatches: recentMatchRows.map((row) => ({
          id: row.id,
          title: row.title,
          playedOn: row.playedOn,
          blueWins: row.blueWins,
          redWins: row.redWins,
          occurredAt: iso(row.publishedAt) ?? `${row.playedOn}T00:00:00.000Z`,
        })),
        recruits,
        competitions,
        gallery: galleryRows.flatMap((row) => row.publishedAt ? [{
          id: row.id,
          title: row.title,
          description: row.description,
          publishedAt: row.publishedAt.toISOString(),
        }] : []),
      },
    };
  }
}
