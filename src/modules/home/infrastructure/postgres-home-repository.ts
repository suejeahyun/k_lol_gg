import { and, asc, count, desc, eq, ilike, inArray, lt, sql } from "drizzle-orm";

import { destructionCompetitions } from "@/platform/db/schema/destruction-competitions";
import { eventCompetitions } from "@/platform/db/schema/event-competitions";
import {
  mediaGalleries,
  mediaGalleryAssets,
  mediaGalleryExternalImages,
} from "@/platform/db/schema/media";
import { matchSeries, privateAssets } from "@/platform/db/schema/matches";
import { recruitParties } from "@/platform/db/schema/recruiting";
import { players } from "@/platform/db/schema/registry";
import { seasons } from "@/platform/db/schema/seasons";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { HomeRepository } from "../application/ports/home-repository";
import {
  mergeRecentHomeItems,
  HOME_PLACEHOLDER_COMPETITION_TITLE_PATTERN,
  selectHomeCompetitions,
  selectHomeDestructionWinnerGalleries,
  type HomeRecruit,
  type HomeSnapshot,
} from "../domain/home-snapshot";

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export class PostgresHomeRepository implements HomeRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async load(): Promise<HomeSnapshot> {
    const primaryMemberCount = sql<number>`(select count(*)::int from jsonb_array_elements(${recruitParties.membersJson}) as member where coalesce((member->>'substitute')::boolean, false) = false)`;
    const [
      playerRows,
      seasonRows,
      matchRows,
      activeSeasonRows,
      recentMatchRows,
      partyRows,
      eventRows,
      destructionRows,
      linkedWinnerGalleryRows,
      curatedLegacyWinnerGalleryRows,
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
        memberCount: primaryMemberCount,
        updatedAt: recruitParties.updatedAt,
      }).from(recruitParties).where(and(eq(recruitParties.status, "IN_PROGRESS"), lt(primaryMemberCount, recruitParties.maximumMembers)))
        .orderBy(desc(recruitParties.updatedAt), desc(recruitParties.id)).limit(4),
      this.database.select({
        id: eventCompetitions.id,
        title: eventCompetitions.title,
        status: eventCompetitions.status,
        participantCount: eventCompetitions.activeParticipantCount,
        updatedAt: eventCompetitions.updatedAt,
      }).from(eventCompetitions).where(and(
        inArray(eventCompetitions.status, ["RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED"]),
        sql`trim(${eventCompetitions.title}) <> '' and trim(${eventCompetitions.title}) !~* ${HOME_PLACEHOLDER_COMPETITION_TITLE_PATTERN}`,
      )).orderBy(asc(sql`case when ${eventCompetitions.status} = 'COMPLETED' then 1 else 0 end`), desc(eventCompetitions.updatedAt), desc(eventCompetitions.id)).limit(4),
      this.database.select({
        id: destructionCompetitions.id,
        title: destructionCompetitions.title,
        status: destructionCompetitions.status,
        participantCount: destructionCompetitions.participantCount,
        updatedAt: destructionCompetitions.updatedAt,
      }).from(destructionCompetitions).where(and(
        inArray(destructionCompetitions.status, ["RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"]),
        sql`trim(${destructionCompetitions.title}) <> '' and trim(${destructionCompetitions.title}) !~* ${HOME_PLACEHOLDER_COMPETITION_TITLE_PATTERN}`,
      )).orderBy(asc(sql`case when ${destructionCompetitions.status} = 'COMPLETED' then 1 else 0 end`), desc(destructionCompetitions.updatedAt), desc(destructionCompetitions.id)).limit(4),
      this.database.select({
        tournamentId: destructionCompetitions.id,
        tournamentTitle: destructionCompetitions.title,
        galleryId: mediaGalleries.id,
        galleryTitle: mediaGalleries.title,
        galleryDescription: mediaGalleries.description,
        publishedAt: mediaGalleries.publishedAt,
      }).from(destructionCompetitions)
        .innerJoin(mediaGalleries, eq(destructionCompetitions.galleryId, mediaGalleries.id))
        .where(and(
          eq(destructionCompetitions.status, "COMPLETED"),
          eq(mediaGalleries.status, "PUBLISHED"),
        ))
        .orderBy(desc(destructionCompetitions.updatedAt), desc(destructionCompetitions.id)).limit(3),
      this.database.select({
        galleryId: mediaGalleries.id,
        galleryTitle: mediaGalleries.title,
        galleryDescription: mediaGalleries.description,
        publishedAt: mediaGalleries.publishedAt,
      }).from(mediaGalleries)
        .where(and(
          eq(mediaGalleries.status, "PUBLISHED"),
          eq(mediaGalleries.showOnHome, true),
          ilike(mediaGalleries.title, "%멸망전%"),
          ilike(mediaGalleries.title, "%우승%"),
        ))
        .orderBy(desc(mediaGalleries.publishedAt), desc(mediaGalleries.id)).limit(3),
    ]);

    const winnerGalleryRows = selectHomeDestructionWinnerGalleries(
      linkedWinnerGalleryRows.flatMap((row) => row.publishedAt ? [{
        tournamentId: row.tournamentId,
        tournamentTitle: row.tournamentTitle,
        galleryId: row.galleryId,
        galleryTitle: row.galleryTitle,
        galleryDescription: row.galleryDescription,
        publishedAt: row.publishedAt.toISOString(),
      }] : []),
      curatedLegacyWinnerGalleryRows.flatMap((row) => row.publishedAt ? [{
        tournamentId: null,
        tournamentTitle: null,
        galleryId: row.galleryId,
        galleryTitle: row.galleryTitle,
        galleryDescription: row.galleryDescription,
        publishedAt: row.publishedAt.toISOString(),
      }] : []),
      3,
    );
    const winnerGalleryIds = winnerGalleryRows.map((row) => row.galleryId);
    const [winnerAssetRows, winnerExternalImageRows] = winnerGalleryIds.length > 0
      ? await Promise.all([
        this.database.select({
          galleryId: mediaGalleryAssets.galleryId,
          assetId: mediaGalleryAssets.privateAssetId,
          ordinal: mediaGalleryAssets.ordinal,
          status: privateAssets.status,
          purpose: privateAssets.purpose,
        }).from(mediaGalleryAssets)
          .innerJoin(privateAssets, eq(mediaGalleryAssets.privateAssetId, privateAssets.id))
          .where(inArray(mediaGalleryAssets.galleryId, winnerGalleryIds)),
        this.database.select({
          galleryId: mediaGalleryExternalImages.galleryId,
          ordinal: mediaGalleryExternalImages.ordinal,
          url: mediaGalleryExternalImages.sourceUrl,
        }).from(mediaGalleryExternalImages)
          .where(inArray(mediaGalleryExternalImages.galleryId, winnerGalleryIds)),
      ])
      : [[], []];

    const activeSeason = activeSeasonRows[0];
    const recruits = mergeRecentHomeItems<HomeRecruit>([
      partyRows.map((row) => ({
        id: row.id,
        kind: "PARTY" as const,
        title: row.title,
        status: row.status,
        summary: `${row.maximumMembers - row.memberCount}자리 남음 · ${row.memberCount}/${row.maximumMembers}명`,
        occurredAt: row.updatedAt.toISOString(),
      })),
    ], 4);

    const competitions = selectHomeCompetitions([
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

    const destructionWinnerGalleries = winnerGalleryRows.flatMap((row) => {
      const assetRows = winnerAssetRows.filter((image) => image.galleryId === row.galleryId);
      if (assetRows.some((image) => image.status !== "READY" || image.purpose !== "GALLERY")) return [];
      const images = [
        ...assetRows.map((image) => ({
          id: image.assetId,
          url: `/api/media/assets/${image.assetId}`,
          ordinal: image.ordinal,
        })),
        ...winnerExternalImageRows.filter((image) => image.galleryId === row.galleryId).map((image) => ({
          id: `external:${row.galleryId}:${image.ordinal}`,
          url: image.url,
          ordinal: image.ordinal,
        })),
      ].sort((left, right) => left.ordinal - right.ordinal);
      if (
        images.length < 1 ||
        images.length > 5 ||
        new Set(images.map((image) => image.ordinal)).size !== images.length
      ) return [];
      return [{
        tournamentId: row.tournamentId,
        tournamentTitle: row.tournamentTitle,
        galleryId: row.galleryId,
        galleryTitle: row.galleryTitle,
        galleryDescription: row.galleryDescription,
        publishedAt: row.publishedAt,
        images,
      }];
    });

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
        destructionWinnerGalleries,
      },
    };
  }
}
