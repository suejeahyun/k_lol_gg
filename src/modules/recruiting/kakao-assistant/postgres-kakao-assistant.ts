import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { createSearchPlayers } from "@/modules/players/application/search-players";
import { PostgresPlayerRepository } from "@/modules/players/infrastructure/postgres-player-repository";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { recruitParties, recruitingCommandReceipts, recruitingNonceBindings, scrimRecruits } from "@/platform/db/schema/recruiting";
import { players } from "@/platform/db/schema/registry";
import { seasonApplications, seasonKakaoPendingApplications, seasons } from "@/platform/db/schema/seasons";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import {
  KakaoAssistantError,
  kakaoReadIdentity,
  toKakaoPlayerSearchItem,
  type KakaoAssistantResponse,
  type KakaoOpenChatStatusDto,
  type KakaoPlayerSearchDto,
  type KakaoSeasonSnapshotCommand,
  type KakaoSeasonSnapshotDto,
  type KakaoSeasonSnapshotEntryDto,
  type KakaoScheduledNoticeDto,
} from "./domain";

const RECEIPT_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const NONCE_TTL_MILLISECONDS = 15 * 60 * 1_000;
const MAXIMUM_PLAYER_RESULTS = 20;
const MAXIMUM_STATUS_RESULTS = 20;

type SignedReadInput = Readonly<{
  actorPrincipalId: string;
  intent: VerifiedKakaoWebhookIntent;
  requestKey: string;
  scope: string;
}>;

export type KakaoAssistantResult<T extends KakaoAssistantResponse = KakaoAssistantResponse> = Readonly<{
  body: T;
  replayed: boolean;
}>;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function kstDateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function normalizedIdentity(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function splitRiotId(value: string | null) {
  if (!value) return null;
  const separator = value.lastIndexOf("#");
  if (separator < 1 || separator === value.length - 1) return null;
  return {
    nickname: normalizedIdentity(value.slice(0, separator)),
    tagLine: normalizedIdentity(value.slice(separator + 1)),
  };
}

export class PostgresKakaoAssistant {
  constructor(private readonly database: V2Database) {}

  private async execute<T extends KakaoAssistantResponse>(
    input: SignedReadInput,
    query: (transaction: V2Transaction) => Promise<T>,
  ): Promise<KakaoAssistantResult<T>> {
    return withTransaction(this.database, async (transaction) => {
      const identity = kakaoReadIdentity({
        principalId: input.actorPrincipalId,
        scope: input.scope,
        requestKey: input.requestKey,
        bodyDigestHex: input.intent.bodyDigestHex,
      });
      const nonceHash = createHash("sha256")
        .update(`klol-v2:recruiting-nonce:v1\0${input.actorPrincipalId}\0${input.intent.nonce}`)
        .digest();
      const bindingHash = createHash("sha256").update([
        "klol-v2:recruiting-nonce-binding:v1",
        input.scope,
        identity.keyHash.toString("hex"),
        identity.requestHash.toString("hex"),
        input.intent.bodyDigestHex,
      ].join("\0")).digest();
      const now = new Date();

      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorPrincipalId}:${nonceHash.toString("hex")}`}, 0))`);
      const nonce = (await transaction.select().from(recruitingNonceBindings).where(and(
        eq(recruitingNonceBindings.actorPrincipalId, input.actorPrincipalId),
        eq(recruitingNonceBindings.nonceHash, nonceHash),
      )).limit(1))[0];
      if (nonce && nonce.expiresAt > now && !sameBytes(nonce.bindingHash, bindingHash)) {
        throw new KakaoAssistantError("NONCE_CONFLICT");
      }
      if (!nonce || nonce.expiresAt <= now) {
        const values = {
          actorKind: "BOT" as const,
          actorPrincipalId: input.actorPrincipalId,
          nonceHash,
          bindingHash,
          keyId: input.intent.keyId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + NONCE_TTL_MILLISECONDS),
        };
        if (nonce) await transaction.update(recruitingNonceBindings).set(values).where(eq(recruitingNonceBindings.id, nonce.id));
        else await transaction.insert(recruitingNonceBindings).values({ id: randomUUID(), ...values });
      }

      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorPrincipalId}:${input.scope}:${identity.keyHash.toString("hex")}`}, 0))`);
      const receipt = (await transaction.select().from(recruitingCommandReceipts).where(and(
        eq(recruitingCommandReceipts.actorPrincipalId, input.actorPrincipalId),
        eq(recruitingCommandReceipts.scope, input.scope),
        eq(recruitingCommandReceipts.keyHash, identity.keyHash),
      )).limit(1))[0];
      if (receipt && receipt.expiresAt > now) {
        if (!sameBytes(receipt.requestHash, identity.requestHash) || receipt.bodyDigestHex !== input.intent.bodyDigestHex) {
          throw new KakaoAssistantError("IDEMPOTENCY_MISMATCH");
        }
        if (receipt.responseStatus !== 200 || !receipt.responseJson || receipt.responseRevision !== 0) {
          throw new KakaoAssistantError("INCOMPLETE_RECEIPT");
        }
        return { body: receipt.responseJson as T, replayed: true };
      }

      const receiptValues = {
        actorPrincipalId: input.actorPrincipalId,
        scope: input.scope,
        keyHash: identity.keyHash,
        requestHash: identity.requestHash,
        bodyDigestHex: input.intent.bodyDigestHex,
        responseStatus: null,
        responseJson: null,
        responseRevision: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + RECEIPT_TTL_MILLISECONDS),
      };
      let receiptId: string;
      if (receipt) {
        receiptId = receipt.id;
        await transaction.update(recruitingCommandReceipts).set(receiptValues).where(eq(recruitingCommandReceipts.id, receipt.id));
      } else {
        receiptId = randomUUID();
        await transaction.insert(recruitingCommandReceipts).values({ id: receiptId, ...receiptValues });
      }

      const body = await query(transaction);
      const updated = await transaction.update(recruitingCommandReceipts).set({
        responseStatus: 200,
        responseJson: body,
        responseRevision: 0,
      }).where(and(eq(recruitingCommandReceipts.id, receiptId), eq(recruitingCommandReceipts.requestHash, identity.requestHash)))
        .returning({ id: recruitingCommandReceipts.id });
      if (updated.length !== 1) throw new KakaoAssistantError("INCOMPLETE_RECEIPT");
      return { body, replayed: false };
    });
  }

  searchPlayers(input: SignedReadInput & Readonly<{ query: string }>): Promise<KakaoAssistantResult<KakaoPlayerSearchDto>> {
    return this.execute(input, async (transaction) => {
      const results = await createSearchPlayers(new PostgresPlayerRepository(transaction))(input.query);
      const items = results.slice(0, MAXIMUM_PLAYER_RESULTS).map(toKakaoPlayerSearchItem);
      return Object.freeze({
        kind: "PLAYER_SEARCH" as const,
        query: input.query,
        items: Object.freeze(items),
        totalCount: results.length,
        truncated: results.length > items.length,
      });
    });
  }

  getOpenChatStatus(input: SignedReadInput): Promise<KakaoAssistantResult<KakaoOpenChatStatusDto>> {
    return this.execute(input, async (transaction) => {
      const [parties, scrims] = await Promise.all([
        transaction.select({
          id: recruitParties.id,
          recruitDate: recruitParties.recruitDate,
          recruitNumber: recruitParties.recruitNumber,
          title: recruitParties.title,
          status: recruitParties.status,
          members: recruitParties.membersJson,
          maximumMembers: recruitParties.maximumMembers,
          scheduledStartAt: recruitParties.scheduledStartAt,
        }).from(recruitParties).where(eq(recruitParties.status, "IN_PROGRESS"))
          .orderBy(desc(recruitParties.recruitDate), asc(recruitParties.recruitNumber)).limit(MAXIMUM_STATUS_RESULTS),
        transaction.select({
          id: scrimRecruits.id,
          recruitDate: scrimRecruits.recruitDate,
          scrimNumber: scrimRecruits.scrimNumber,
          status: scrimRecruits.status,
          bestOf: scrimRecruits.bestOf,
          scheduledAt: scrimRecruits.scheduledAt,
        }).from(scrimRecruits).where(inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]))
          .orderBy(desc(scrimRecruits.recruitDate), asc(scrimRecruits.scrimNumber)).limit(MAXIMUM_STATUS_RESULTS),
      ]);
      return Object.freeze({
        kind: "OPENCHAT_STATUS" as const,
        parties: Object.freeze(parties.map((party) => Object.freeze({
          id: party.id,
          recruitDate: party.recruitDate,
          recruitNumber: party.recruitNumber,
          title: party.title,
          status: "IN_PROGRESS" as const,
          memberCount: Array.isArray(party.members)
            ? party.members.filter((member) =>
                member !== null &&
                typeof member === "object" &&
                !Array.isArray(member) &&
                member.substitute === false,
              ).length
            : 0,
          maximumMembers: party.maximumMembers,
          scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
        }))),
        scrims: Object.freeze(scrims.map((scrim) => Object.freeze({
          id: scrim.id,
          recruitDate: scrim.recruitDate,
          scrimNumber: scrim.scrimNumber,
          status: scrim.status as "RECRUITING" | "MATCHED" | "CONFIRMED",
          bestOf: scrim.bestOf,
          scheduledAt: scrim.scheduledAt?.toISOString() ?? null,
        }))),
      });
    });
  }

  getScheduledNotice(input: SignedReadInput & Readonly<{ slot: string | null; now?: Date }>): Promise<KakaoAssistantResult<KakaoScheduledNoticeDto>> {
    return this.execute(input, async (transaction) => {
      const now = input.now ?? new Date();
      const date = kstDateKey(now);
      const season = (await transaction.select({ id: seasons.id }).from(seasons).where(eq(seasons.status, "ACTIVE")).limit(1))[0];
      const positionCounts = { TOP: 0, JGL: 0, MID: 0, ADC: 0, SUP: 0 };
      if (season) {
        const applications = await transaction.select({ mainPosition: seasonApplications.mainPosition })
          .from(seasonApplications).where(and(
            eq(seasonApplications.seasonId, season.id),
            eq(seasonApplications.applyDate, date),
            inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
          ));
        for (const application of applications) {
          if (application.mainPosition !== "ALL") positionCounts[application.mainPosition] += 1;
        }
        const total = applications.length;
        const shortagePositions = (Object.keys(positionCounts) as (keyof typeof positionCounts)[])
          .filter((position) => positionCounts[position] < 2);
        return Object.freeze({
          kind: "SCHEDULED_NOTICE" as const,
          slot: input.slot,
          seasonId: season.id,
          date,
          targetCount: 10 as const,
          total,
          remaining: Math.max(10 - total, 0),
          positionCounts: Object.freeze(positionCounts),
          shortagePositions: Object.freeze(shortagePositions),
        });
      }
      return Object.freeze({
        kind: "SCHEDULED_NOTICE" as const,
        slot: input.slot,
        seasonId: null,
        date,
        targetCount: 10 as const,
        total: 0,
        remaining: 10,
        positionCounts: Object.freeze(positionCounts),
        shortagePositions: Object.freeze(["TOP", "JGL", "MID", "ADC", "SUP"] as const),
      });
    });
  }

  syncSeasonSnapshot(input: SignedReadInput & Readonly<{
    command: KakaoSeasonSnapshotCommand;
    requestId: string;
    now?: Date;
  }>): Promise<KakaoAssistantResult<KakaoSeasonSnapshotDto>> {
    return this.execute(input, async (transaction) => {
      const now = input.now ?? new Date();
      const command = input.command;
      const season = (await transaction.select().from(seasons).where(eq(seasons.id, command.seasonId)).for("update").limit(1))[0];
      if (!season) throw new KakaoAssistantError("NOT_FOUND");
      if (command.action !== "STATUS") {
        if (season.status !== "ACTIVE" ||
            (season.applicationsOpenAt && season.applicationsOpenAt > now) ||
            (season.applicationsCloseAt && season.applicationsCloseAt <= now) ||
            command.applyDate !== kstDateKey(now)) {
          throw new KakaoAssistantError("CONFLICT");
        }
      }
      const roundKey = `${command.seasonId}:${command.applyDate}:${command.recruitNo}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-season:${roundKey}`}, 0))`);

      let cancelledCount = 0;
      if (command.action === "SYNC") {
        const sourceHash = Buffer.from(input.intent.bodyDigestHex, "hex");
        const matched: Array<{
          participant: KakaoSeasonSnapshotCommand["participants"][number];
          candidates: (typeof players.$inferSelect)[];
        }> = [];
        for (const participant of command.participants) {
          const riot = splitRiotId(participant.riotId);
          const identity = normalizedIdentity(participant.name);
          const candidates = await transaction.select().from(players).where(and(
            eq(players.status, "ACTIVE"),
            riot
              ? and(eq(players.nicknameNormalized, riot.nickname), eq(players.tagLineNormalized, riot.tagLine))
              : or(eq(players.memberNameNormalized, identity), eq(players.nicknameNormalized, identity)),
          )).orderBy(asc(players.id)).limit(3);
          matched.push({ participant, candidates });
        }
        const uniqueMatchedIds = matched
          .filter((item) => item.candidates.length === 1 && !item.participant.reserve)
          .map((item) => item.candidates[0]!.id);
        if (new Set(uniqueMatchedIds).size !== uniqueMatchedIds.length) throw new KakaoAssistantError("CONFLICT");

        const currentApplications = await transaction.select().from(seasonApplications).where(and(
          eq(seasonApplications.seasonId, command.seasonId),
          eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo),
          eq(seasonApplications.source, "KAKAO"),
        )).for("update");
        for (const current of currentApplications) {
          if (uniqueMatchedIds.includes(current.playerId) || current.status === "CANCELLED") continue;
          if (current.status !== "APPLIED") throw new KakaoAssistantError("CONFLICT");
          await transaction.update(seasonApplications).set({
            status: "CANCELLED", cancelledAt: now, revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
          }).where(eq(seasonApplications.id, current.id));
          cancelledCount += 1;
        }

        const activeSlots = new Set(command.participants.map((participant) => participant.slotNo));
        const currentPending = await transaction.select().from(seasonKakaoPendingApplications).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )).for("update");
        for (const pending of currentPending) {
          if (activeSlots.has(pending.slotNo)) continue;
          await transaction.update(seasonKakaoPendingApplications).set({
            status: "CANCELLED", cancelledAt: now, revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
          }).where(eq(seasonKakaoPendingApplications.id, pending.id));
          cancelledCount += 1;
        }

        for (const { participant, candidates } of matched) {
          const matchedPlayer = candidates.length === 1 ? candidates[0]! : null;
          if (matchedPlayer && !participant.reserve) {
            const current = (await transaction.select().from(seasonApplications).where(and(
              eq(seasonApplications.seasonId, command.seasonId),
              eq(seasonApplications.playerId, matchedPlayer.id),
              eq(seasonApplications.applyDate, command.applyDate),
              eq(seasonApplications.recruitNo, command.recruitNo),
            )).for("update").limit(1))[0];
            if (current && !["APPLIED", "CANCELLED"].includes(current.status)) throw new KakaoAssistantError("CONFLICT");
            if (current) {
              await transaction.update(seasonApplications).set({
                sourceSlotNo: participant.slotNo,
                mainPosition: participant.mainPosition,
                subPositions: [...participant.subPositions],
                status: "APPLIED",
                sourceReferenceHash: current.source === "KAKAO" ? sourceHash : null,
                cancelledAt: null,
                revision: sql`${seasonApplications.revision} + 1`,
                updatedAt: now,
              }).where(eq(seasonApplications.id, current.id));
            } else {
              await transaction.insert(seasonApplications).values({
                id: randomUUID(), seasonId: command.seasonId, playerId: matchedPlayer.id,
                applyDate: command.applyDate, recruitNo: command.recruitNo, sourceSlotNo: participant.slotNo,
                mainPosition: participant.mainPosition, subPositions: [...participant.subPositions], status: "APPLIED",
                source: "KAKAO", sourceReferenceHash: sourceHash, createdAt: now, updatedAt: now,
              });
            }
            const existingPending = currentPending.find((pending) => pending.slotNo === participant.slotNo);
            if (existingPending) await transaction.update(seasonKakaoPendingApplications).set({
              status: "RESOLVED", resolvedAt: now, cancelledAt: null,
              revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
            }).where(eq(seasonKakaoPendingApplications.id, existingPending.id));
            continue;
          }

          const matchState = matchedPlayer && participant.reserve
            ? "MATCHED_RESERVE" as const
            : candidates.length > 1 ? "AMBIGUOUS" as const : "UNMATCHED" as const;
          const pendingValues = {
            matchedPlayerId: matchState === "MATCHED_RESERVE" ? matchedPlayer!.id : null,
            suppliedName: participant.name,
            suppliedRiotId: participant.riotId,
            mainPosition: participant.mainPosition,
            subPositions: [...participant.subPositions],
            reserve: participant.reserve,
            matchState,
            status: "ACTIVE" as const,
            sourceReferenceHash: sourceHash,
            cancelledAt: null,
            resolvedAt: null,
            updatedAt: now,
          };
          const existing = currentPending.find((pending) => pending.slotNo === participant.slotNo);
          if (existing) await transaction.update(seasonKakaoPendingApplications).set({
            ...pendingValues, revision: sql`${seasonKakaoPendingApplications.revision} + 1`,
          }).where(eq(seasonKakaoPendingApplications.id, existing.id));
          else await transaction.insert(seasonKakaoPendingApplications).values({
            id: randomUUID(), seasonId: command.seasonId, applyDate: command.applyDate,
            recruitNo: command.recruitNo, slotNo: participant.slotNo, createdAt: now,
            ...pendingValues,
          });
        }
        await transaction.insert(auditEvents).values({
          requestId: input.requestId,
          action: "KAKAO_SEASON_SNAPSHOT_SYNCED",
          targetType: "SEASON_RECRUIT_ROUND",
          targetId: roundKey,
          metadataJson: {
            participantCount: command.participants.length,
            cancelledCount,
            sourceDigest: input.intent.bodyDigestHex,
          },
          createdAt: now,
        });
      } else if (command.action === "CANCEL") {
        const cancelled = await transaction.update(seasonApplications).set({
          status: "CANCELLED", cancelledAt: now, revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
        }).where(and(
          eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo), eq(seasonApplications.source, "KAKAO"),
          eq(seasonApplications.status, "APPLIED"),
        )).returning({ id: seasonApplications.id });
        const pending = await transaction.update(seasonKakaoPendingApplications).set({
          status: "CANCELLED", cancelledAt: now, revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
        }).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )).returning({ id: seasonKakaoPendingApplications.id });
        cancelledCount = cancelled.length + pending.length;
        await transaction.insert(auditEvents).values({
          requestId: input.requestId, action: "KAKAO_SEASON_SNAPSHOT_CANCELLED",
          targetType: "SEASON_RECRUIT_ROUND", targetId: roundKey,
          metadataJson: { cancelledCount }, createdAt: now,
        });
      }

      const applications = await transaction.select({ application: seasonApplications, player: players }).from(seasonApplications)
        .innerJoin(players, eq(players.id, seasonApplications.playerId)).where(and(
          eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
        ));
      const pending = await transaction.select({ pending: seasonKakaoPendingApplications, player: players }).from(seasonKakaoPendingApplications)
        .leftJoin(players, eq(players.id, seasonKakaoPendingApplications.matchedPlayerId)).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        ));
      const entries: KakaoSeasonSnapshotEntryDto[] = [
        ...applications.map(({ application, player }) => ({
          slotNo: application.sourceSlotNo ?? 999,
          status: "APPLIED" as const,
          suppliedName: player.memberName,
          player: { playerId: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` },
        })),
        ...pending.map(({ pending: item, player }) => ({
          slotNo: item.slotNo,
          status: item.matchState,
          suppliedName: item.suppliedName,
          player: player ? { playerId: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` } : null,
        })),
      ];
      entries.sort((left, right) => left.slotNo - right.slotNo || left.suppliedName.localeCompare(right.suppliedName, "ko"));
      return Object.freeze({
        kind: "SEASON_APPLICATION_SNAPSHOT" as const,
        seasonId: command.seasonId,
        applyDate: command.applyDate,
        recruitNo: command.recruitNo,
        entries: Object.freeze(entries),
        appliedCount: applications.length,
        reserveCount: pending.filter(({ pending: item }) => item.matchState === "MATCHED_RESERVE").length,
        pendingCount: pending.filter(({ pending: item }) => item.matchState !== "MATCHED_RESERVE").length,
        cancelledCount,
      });
    });
  }
}
