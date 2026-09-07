import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { createSearchPlayers } from "@/modules/players/application/search-players";
import { PostgresPlayerRepository } from "@/modules/players/infrastructure/postgres-player-repository";
import type { V2Database } from "@/platform/db/database";
import { recruitParties, recruitingCommandReceipts, recruitingNonceBindings, scrimRecruits } from "@/platform/db/schema/recruiting";
import { seasonApplications, seasons } from "@/platform/db/schema/seasons";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import {
  KakaoAssistantError,
  kakaoReadIdentity,
  toKakaoPlayerSearchItem,
  type KakaoAssistantResponse,
  type KakaoOpenChatStatusDto,
  type KakaoPlayerSearchDto,
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
}
