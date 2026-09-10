import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { createSearchPlayers } from "@/modules/players/application/search-players";
import { PostgresPlayerRepository } from "@/modules/players/infrastructure/postgres-player-repository";
import { PostgresStatisticsQueryRepository } from "@/modules/statistics/infrastructure/postgres-statistics-query-repository";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { matchGames, matchParticipants, matchSeries } from "@/platform/db/schema/matches";
import { recruitParties, recruitingCommandReceipts, recruitingNonceBindings, scrimRecruits } from "@/platform/db/schema/recruiting";
import { players } from "@/platform/db/schema/registry";
import { seasonApplications, seasonKakaoPendingApplications, seasons } from "@/platform/db/schema/seasons";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import { planSeasonApplicationMerge } from "@/modules/seasons/domain/application-source-policy";
import {
  KakaoAssistantError,
  kakaoReadIdentity,
  toKakaoPlayerSearchItem,
  type KakaoAssistantResponse,
  type KakaoOpenChatStatusDto,
  type KakaoPlayerSearchDto,
  type KakaoPlayerRecordDto,
  type KakaoRankingDto,
  type KakaoSeasonSnapshotCommand,
  type KakaoSeasonSnapshotDto,
  type KakaoSeasonSnapshotEntryDto,
  type KakaoScheduledNoticeDto,
  type KakaoV4StaticReceiptDto,
} from "./domain";

const RECEIPT_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const NONCE_TTL_MILLISECONDS = 15 * 60 * 1_000;
const MAXIMUM_PLAYER_RESULTS = 20;
const MAXIMUM_STATUS_RESULTS = 20;
const RECRUIT_POSITIONS = new Set(["TOP", "JGL", "MID", "ADC", "SUP"]);
const LEGACY_INHOUSE_CAPACITY = 10;
const LEGACY_INHOUSE_TIERS: Readonly<Record<string, string>> = Object.freeze({
  IRON: "I", BRONZE: "B", SILVER: "S", GOLD: "G", PLATINUM: "P", EMERALD: "E",
  DIAMOND: "D", MASTER: "M", GRANDMASTER: "GM", CHALLENGER: "C", UNRANKED: "U",
});
const LEGACY_INHOUSE_TIER_INITIALS: Readonly<Record<string, string>> = Object.freeze({
  I: "I", B: "B", S: "S", G: "G", P: "P", E: "E", D: "D", M: "M", C: "C",
});
const LEGACY_INHOUSE_POSITIONS = Object.freeze({ TOP: "TOP", JGL: "JG", MID: "MD", ADC: "AD", SUP: "SUP", ALL: "ALL" });

type LegacySeasonEntry = Readonly<{
  recruitNo: number;
  slotNo: number | null;
  reserve: boolean;
  name: string;
  currentTier: string | null;
  peakTier: string | null;
  mainPosition: KakaoSeasonSnapshotEntryDto["mainPosition"];
  subPositions: KakaoSeasonSnapshotEntryDto["subPositions"];
  createdAt: Date;
}>;

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

function seasonRoomIdHash(value: string) {
  return createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${value}`).digest();
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function publicRecruitMembers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((member) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) return [];
    const item = member as Record<string, unknown>;
    if (typeof item.name !== "string" || !Number.isSafeInteger(item.slotNo) || typeof item.substitute !== "boolean") return [];
    if (item.position !== null && (typeof item.position !== "string" || !RECRUIT_POSITIONS.has(item.position))) return [];
    return [{
      name: item.name,
      position: item.position as "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null,
      slotNo: Number(item.slotNo),
      substitute: item.substitute,
    }];
  });
}

function publicScrimLineup(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const fields = ["top", "jungle", "mid", "adc", "support"] as const;
  if (Object.keys(item).sort().join("|") !== [...fields].sort().join("|") ||
      !fields.every((field) => item[field] === null || typeof item[field] === "string")) return null;
  return Object.freeze({
    top: item.top as string | null,
    jungle: item.jungle as string | null,
    mid: item.mid as string | null,
    adc: item.adc as string | null,
    support: item.support as string | null,
  });
}

function legacyInhouseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}-${month}-${day}`;
}

function legacyInhouseTier(value: string | null) {
  const text = String(value ?? "UNRANKED").trim().toUpperCase();
  if (LEGACY_INHOUSE_TIERS[text]) return LEGACY_INHOUSE_TIERS[text];
  if (text.includes("아이언")) return "I";
  if (text.includes("브론즈")) return "B";
  if (text.includes("실버")) return "S";
  if (text.includes("골드")) return "G";
  if (text.includes("플래") || text.includes("플레")) return "P";
  if (text.includes("에메")) return "E";
  if (text.includes("다이아")) return "D";
  if (text.includes("그랜드마스터") || text.includes("그마")) return "GM";
  if (text.includes("마스터") || text === "마") return "M";
  if (text.includes("챌")) return "C";
  return LEGACY_INHOUSE_TIER_INITIALS[text.charAt(0)] ?? "U";
}

function legacyInhousePositions(entry: Pick<LegacySeasonEntry, "mainPosition" | "subPositions">) {
  return [entry.mainPosition, ...entry.subPositions].map((position) => LEGACY_INHOUSE_POSITIONS[position]).join("/");
}

function compareLegacySeasonEntries(left: LegacySeasonEntry, right: LegacySeasonEntry) {
  const leftSlot = left.slotNo;
  const rightSlot = right.slotNo;
  if (leftSlot !== null && rightSlot !== null && leftSlot !== rightSlot) return leftSlot - rightSlot;
  if (leftSlot !== null && rightSlot === null) return -1;
  if (leftSlot === null && rightSlot !== null) return 1;
  return left.createdAt.getTime() - right.createdAt.getTime() || left.name.localeCompare(right.name, "ko");
}

function legacyInhouseEntryLine(prefix: string, entry: LegacySeasonEntry | null) {
  if (!entry) return `${prefix}.`;
  const name = entry.name.normalize("NFKC").replace(/[\r\n/]+/gu, " ").replace(/\s+/gu, " ").trim();
  return `${prefix}. ${name}/${legacyInhouseTier(entry.currentTier)}/${legacyInhouseTier(entry.peakTier)}/${legacyInhousePositions(entry)}`;
}

function legacyInhouseDetail(applyDate: string, recruitNo: number, entries: readonly LegacySeasonEntry[]) {
  const mainEntries = entries.filter((entry) => !entry.reserve).sort(compareLegacySeasonEntries);
  const reserveEntries = entries.filter((entry) => entry.reserve).sort(compareLegacySeasonEntries);
  const slots: Array<LegacySeasonEntry | null> = Array.from({ length: LEGACY_INHOUSE_CAPACITY }, () => null);
  const overflow: LegacySeasonEntry[] = [];
  for (const entry of mainEntries) {
    if (entry.slotNo !== null && entry.slotNo >= 1 && entry.slotNo <= LEGACY_INHOUSE_CAPACITY && !slots[entry.slotNo - 1]) {
      slots[entry.slotNo - 1] = entry;
      continue;
    }
    const emptyIndex = slots.findIndex((candidate) => candidate === null);
    if (emptyIndex >= 0) slots[emptyIndex] = entry;
    else overflow.push(entry);
  }
  const lines = [
    `📢 내전하실분 #${recruitNo}`,
    " 》협곡",
    ` 》${applyDate} 21:00 시작`,
    `👥 ${mainEntries.length}/${LEGACY_INHOUSE_CAPACITY}명`,
    "",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "EX) 1.지후/P/E/AD/MD",
    "",
  ];
  slots.forEach((entry, index) => lines.push(legacyInhouseEntryLine(String(index + 1), entry)));
  overflow.forEach((entry, index) => lines.push(legacyInhouseEntryLine(String(LEGACY_INHOUSE_CAPACITY + index + 1), entry)));
  if (reserveEntries.length > 0) {
    lines.push("");
    reserveEntries.forEach((entry, index) => lines.push(legacyInhouseEntryLine(`예비 ${index + 1}`, entry)));
  }
  return lines.join("\n");
}

function legacyInhouseOverview(applyDate: string, grouped: ReadonlyMap<number, readonly LegacySeasonEntry[]>) {
  if (grouped.size === 0) {
    return "[K-LOL.GG 내전현황]\n오늘 등록된 내전 신청이 없습니다.\n\n참가 신청: 내전참가";
  }
  const recruitNos = [...grouped.keys()].sort((left, right) => left - right);
  const lines = ["[K-LOL.GG 내전현황]", "🔎 전체 명단: 내전상세 번호", ""];
  for (const recruitNo of recruitNos) {
    const entries = grouped.get(recruitNo) ?? [];
    const mainCount = entries.filter((entry) => !entry.reserve).length;
    const reserveCount = entries.length - mainCount;
    const reserveText = reserveCount > 0 ? ` / 예비 ${reserveCount}` : "";
    lines.push(`#${recruitNo} ${legacyInhouseDate(applyDate)} 21:00 시작 (${mainCount}/${LEGACY_INHOUSE_CAPACITY}${reserveText})`);
    lines.push(`└ 내전상세 ${recruitNo}`);
  }
  lines.push("", `상세 명령: ${recruitNos.map((recruitNo) => `내전상세 ${recruitNo}`).join(" / ")}`);
  return lines.join("\n");
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

  getPlayerRecord(input: SignedReadInput & Readonly<{ query: string; mode: "RECORD" | "RECENT" }>): Promise<KakaoAssistantResult<KakaoPlayerRecordDto>> {
    return this.execute(input, async (transaction) => {
      const candidates = await createSearchPlayers(new PostgresPlayerRepository(transaction))(input.query);
      const normalized = normalizedIdentity(input.query);
      const player = candidates.find((candidate) =>
        normalizedIdentity(candidate.riotId) === normalized || normalizedIdentity(candidate.displayName) === normalized,
      ) ?? candidates[0] ?? null;
      if (!player) {
        return Object.freeze({
          kind: "PLAYER_RECORD" as const,
          mode: input.mode,
          query: input.query,
          player: null,
          currentTier: null,
          peakTier: null,
          season: null,
          summary: null,
          recentMatches: Object.freeze([]),
        });
      }
      const statistics = await new PostgresStatisticsQueryRepository(transaction)
        .getPublicPlayerStatistics(player.id, null);
      if (!statistics) throw new KakaoAssistantError("NOT_FOUND");
      const playerTier = (await transaction.select({
        currentTier: players.currentTier,
        peakTier: players.peakTier,
      }).from(players).where(eq(players.id, player.id)).limit(1))[0] ?? null;
      const kdaRows = !statistics.season ? [] : await transaction.select({
        matchId: matchSeries.id,
        gameNumber: matchGames.gameNumber,
        kills: matchParticipants.kills,
        deaths: matchParticipants.deaths,
        assists: matchParticipants.assists,
        totalKills: sql<number>`sum(${matchParticipants.kills}) over ()`.mapWith(Number),
        totalDeaths: sql<number>`sum(${matchParticipants.deaths}) over ()`.mapWith(Number),
        totalAssists: sql<number>`sum(${matchParticipants.assists}) over ()`.mapWith(Number),
      }).from(matchParticipants)
        .innerJoin(matchGames, eq(matchGames.id, matchParticipants.gameId))
        .innerJoin(matchSeries, eq(matchSeries.id, matchGames.seriesId))
        .where(and(
          eq(matchParticipants.playerId, player.id),
          eq(matchSeries.seasonId, statistics.season.id),
          eq(matchSeries.status, "PUBLISHED"),
        ))
        .orderBy(desc(matchSeries.playedOn), desc(matchSeries.startedAt), desc(matchSeries.id), desc(matchGames.gameNumber))
        .limit(10);
      const recentKda = new Map(kdaRows.map((row) => [`${row.matchId}:${row.gameNumber}`, row]));
      const totals = kdaRows[0] ?? null;
      const kills = totals?.totalKills ?? 0;
      const deaths = totals?.totalDeaths ?? 0;
      const assists = totals?.totalAssists ?? 0;
      return Object.freeze({
        kind: "PLAYER_RECORD" as const,
        mode: input.mode,
        query: input.query,
        player: Object.freeze({
          playerId: statistics.player.id,
          displayName: statistics.player.displayName,
          riotId: statistics.player.riotId,
        }),
        currentTier: playerTier?.currentTier ?? null,
        peakTier: playerTier?.peakTier ?? null,
        season: statistics.season
          ? Object.freeze({ id: statistics.season.id, name: statistics.season.name })
          : null,
        summary: Object.freeze({
          ...statistics.summary,
          kills,
          deaths,
          assists,
          kda: (kills + assists) / Math.max(1, deaths),
        }),
        recentMatches: Object.freeze(statistics.recentMatches.slice(0, 10).map((match) => {
          const participant = recentKda.get(`${match.matchId}:${match.gameNumber}`);
          return Object.freeze({
          matchId: match.matchId,
          title: match.title,
          playedOn: match.playedOn,
          gameNumber: match.gameNumber,
          championName: match.championName,
          team: match.team,
          position: match.position,
          won: match.won,
          mvp: match.mvp,
          kills: participant?.kills ?? 0,
          deaths: participant?.deaths ?? 0,
          assists: participant?.assists ?? 0,
          });
        })),
      });
    });
  }

  getRanking(input: SignedReadInput): Promise<KakaoAssistantResult<KakaoRankingDto>> {
    return this.execute(input, async (transaction) => {
      const minimumParticipation = 10;
      const ranking = await new PostgresStatisticsQueryRepository(transaction)
        .getPublicSeasonRanking(null, minimumParticipation);
      const rows = ranking.rankings.slice(0, 10);
      const kdaRows = !ranking.season || rows.length === 0 ? [] : await transaction.select({
        playerId: matchParticipants.playerId,
        kills: sql<number>`sum(${matchParticipants.kills})`.mapWith(Number),
        deaths: sql<number>`sum(${matchParticipants.deaths})`.mapWith(Number),
        assists: sql<number>`sum(${matchParticipants.assists})`.mapWith(Number),
      }).from(matchParticipants)
        .innerJoin(matchGames, eq(matchGames.id, matchParticipants.gameId))
        .innerJoin(matchSeries, eq(matchSeries.id, matchGames.seriesId))
        .where(and(
          inArray(matchParticipants.playerId, rows.map((row) => row.playerId)),
          eq(matchSeries.seasonId, ranking.season.id),
          eq(matchSeries.status, "PUBLISHED"),
        ))
        .groupBy(matchParticipants.playerId);
      const kdaByPlayer = new Map(kdaRows.map((row) => [row.playerId, (row.kills + row.assists) / Math.max(1, row.deaths)]));
      return Object.freeze({
        kind: "RANKING" as const,
        season: ranking.season ? Object.freeze({ id: ranking.season.id, name: ranking.season.name }) : null,
        minimumParticipation,
        rows: Object.freeze(rows.map((row) => Object.freeze({ ...row, kda: kdaByPlayer.get(row.playerId) ?? 0 }))),
        truncated: ranking.rankings.length > rows.length,
      });
    });
  }

  getOpenChatStatus(input: SignedReadInput & Readonly<{ projection?: "PARTY" | "SCRIM" }>): Promise<KakaoAssistantResult<KakaoOpenChatStatusDto>> {
    return this.execute(input, async (transaction) => {
      const today = kstDateKey(new Date());
      const partyRows = input.projection === "SCRIM" ? [] : await transaction.select({
          id: recruitParties.id,
          revision: recruitParties.revision,
          recruitDate: recruitParties.recruitDate,
          resetSequence: recruitParties.resetSequence,
          recruitNumber: recruitParties.recruitNumber,
          type: recruitParties.type,
          title: recruitParties.title,
          status: recruitParties.status,
          members: recruitParties.membersJson,
          maximumMembers: recruitParties.maximumMembers,
          startTimeText: recruitParties.startTimeText,
          gameInfo: recruitParties.gameInfo,
          scheduledStartAt: recruitParties.scheduledStartAt,
        }).from(recruitParties).where(and(
          eq(recruitParties.status, "IN_PROGRESS"),
          eq(recruitParties.sourceRoomId, input.intent.roomId),
        ))
          .orderBy(desc(recruitParties.recruitDate), asc(recruitParties.recruitNumber)).limit(MAXIMUM_STATUS_RESULTS + 1);
      const scrimRows = input.projection === "PARTY" ? [] : await transaction.select({
          id: scrimRecruits.id,
          revision: scrimRecruits.revision,
          recruitDate: scrimRecruits.recruitDate,
          scrimNumber: scrimRecruits.scrimNumber,
          tournamentId: scrimRecruits.tournamentId,
          legacyTournamentNumber: scrimRecruits.legacyTournamentNumber,
          requesterTeamId: scrimRecruits.requesterTeamId,
          opponentTeamId: scrimRecruits.opponentTeamId,
          title: scrimRecruits.legacyTitle,
          requesterTeamName: scrimRecruits.requesterTeamName,
          opponentTeamName: scrimRecruits.opponentTeamName,
          requesterLineup: scrimRecruits.requesterLineupJson,
          opponentLineup: scrimRecruits.opponentLineupJson,
          memo: scrimRecruits.legacyMemo,
          seriesRuleText: scrimRecruits.legacySeriesRuleText,
          status: scrimRecruits.status,
          bestOf: scrimRecruits.bestOf,
          scheduledAt: scrimRecruits.scheduledAt,
        }).from(scrimRecruits).where(and(
          inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]),
          eq(scrimRecruits.sourceRoomId, input.intent.roomId),
        ))
          .orderBy(desc(scrimRecruits.recruitDate), asc(scrimRecruits.scrimNumber)).limit(MAXIMUM_STATUS_RESULTS + 1);
      const latestPartyRows = input.projection ? [] : await transaction.select({ resetSequence: recruitParties.resetSequence, recruitNumber: recruitParties.recruitNumber })
          .from(recruitParties).where(eq(recruitParties.recruitDate, today))
          .orderBy(desc(recruitParties.resetSequence), desc(recruitParties.recruitNumber)).limit(1);
      const latestScrimRows = input.projection ? [] : await transaction.select({ scrimNumber: scrimRecruits.scrimNumber })
          .from(scrimRecruits).where(eq(scrimRecruits.recruitDate, today))
          .orderBy(desc(scrimRecruits.scrimNumber)).limit(1);
      const parties = partyRows.slice(0, MAXIMUM_STATUS_RESULTS);
      const scrims = scrimRows.slice(0, MAXIMUM_STATUS_RESULTS);
      const latestParty = latestPartyRows[0];
      const latestScrim = latestScrimRows[0];
      return Object.freeze({
        kind: "OPENCHAT_STATUS" as const,
        nextPartyRecruitNumber: input.projection ? null : !latestParty ? 1 : latestParty.recruitNumber < 99 ? latestParty.recruitNumber + 1 : null,
        nextPartyResetSequence: latestParty?.resetSequence ?? 0,
        nextScrimNumber: input.projection ? null : !latestScrim ? 1 : latestScrim.scrimNumber < 99 ? latestScrim.scrimNumber + 1 : null,
        partiesTruncated: partyRows.length > parties.length,
        scrimsTruncated: scrimRows.length > scrims.length,
        parties: Object.freeze(parties.map((party) => {
          const members = publicRecruitMembers(party.members);
          return Object.freeze({
            id: party.id,
            revision: party.revision,
            recruitDate: party.recruitDate,
            resetSequence: party.resetSequence,
            recruitNumber: party.recruitNumber,
            type: party.type,
            title: party.title,
            status: "IN_PROGRESS" as const,
            memberCount: members.filter((member) => !member.substitute).length,
            reserveCount: members.filter((member) => member.substitute).length,
            maximumMembers: party.maximumMembers,
            members: Object.freeze(members.map((member) => Object.freeze(member))),
            startTimeText: party.startTimeText,
            gameInfo: party.gameInfo,
            scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
          });
        })),
        scrims: Object.freeze(scrims.map((scrim) => Object.freeze({
          id: scrim.id,
          revision: scrim.revision,
          recruitDate: scrim.recruitDate,
          scrimNumber: scrim.scrimNumber,
          tournamentId: scrim.tournamentId,
          legacyTournamentNumber: scrim.legacyTournamentNumber,
          requesterTeamId: scrim.requesterTeamId,
          opponentTeamId: scrim.opponentTeamId,
          title: scrim.title,
          requesterTeamName: scrim.requesterTeamName,
          opponentTeamName: scrim.opponentTeamName,
          requesterLineup: publicScrimLineup(scrim.requesterLineup),
          opponentLineup: publicScrimLineup(scrim.opponentLineup),
          memo: scrim.memo,
          seriesRuleText: scrim.seriesRuleText,
          status: scrim.status as "RECRUITING" | "MATCHED" | "CONFIRMED",
          bestOf: scrim.bestOf ?? 3,
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

  recordV4StaticReply(input: SignedReadInput & Readonly<{ legacyReply: string }>): Promise<KakaoAssistantResult<KakaoV4StaticReceiptDto>> {
    return this.execute(input, async () => Object.freeze({
      kind: "KAKAO_V4_STATIC_RECEIPT" as const,
      receiptVersion: 1 as const,
      legacyReply: input.legacyReply,
    }));
  }

  syncSeasonSnapshot(input: SignedReadInput & Readonly<{
    command: KakaoSeasonSnapshotCommand;
    requestId: string;
    now?: Date;
  }>): Promise<KakaoAssistantResult<KakaoSeasonSnapshotDto>> {
    return this.execute(input, async (transaction) => {
      const now = input.now ?? new Date();
      const requested = input.command;
      const seasonCandidates = requested.seasonId
        ? await transaction.select().from(seasons).where(eq(seasons.id, requested.seasonId)).for("update").limit(1)
        : await transaction.select().from(seasons).where(eq(seasons.status, "ACTIVE")).orderBy(asc(seasons.id)).for("update").limit(2);
      if (seasonCandidates.length === 0) throw new KakaoAssistantError("NOT_FOUND");
      if (requested.seasonId === null && seasonCandidates.length !== 1) throw new KakaoAssistantError("CONFLICT");
      const season = seasonCandidates[0]!;
      const command = { ...requested, seasonId: season.id } as KakaoSeasonSnapshotCommand & Readonly<{ seasonId: string }>;
      if (command.action !== "STATUS") {
        if (season.status !== "ACTIVE" ||
            (season.applicationsOpenAt && season.applicationsOpenAt > now) ||
            (season.applicationsCloseAt && season.applicationsCloseAt <= now) ||
            command.applyDate !== kstDateKey(now)) {
          throw new KakaoAssistantError("CONFLICT");
        }
      }
      const sourceRoomIdHash = seasonRoomIdHash(input.intent.roomId);
      const sourceMode = command.action === "STATUS" ? "RIFT" as const : command.mode;
      const roomScope = sourceRoomIdHash.toString("hex");
      const roundKey = `${command.seasonId}:${command.applyDate}:${command.recruitNo ?? "all"}:${sourceMode}:${roomScope}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-season:${roundKey}`}, 0))`);

      let cancelledCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
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
          eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonApplications.sourceMode, sourceMode),
        )).for("update");
        for (const current of currentApplications) {
          if (uniqueMatchedIds.includes(current.playerId) || current.status === "CANCELLED") continue;
          if (current.status !== "APPLIED") continue;
          await transaction.update(seasonApplications).set({
            status: "CANCELLED", cancelledAt: now, revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
          }).where(eq(seasonApplications.id, current.id));
          cancelledCount += 1;
        }

        const activeSlots = new Set(command.participants.map((participant) => participant.slotNo));
        // The slot key is unique across every lifecycle state. Lock all rows so a
        // later snapshot reactivates the same row instead of inserting beside a
        // RESOLVED or CANCELLED row and violating season_kakao_pending_slot_uidx.
        const currentPending = await transaction.select().from(seasonKakaoPendingApplications).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
        )).for("update");
        for (const pending of currentPending) {
          if (pending.status !== "ACTIVE" || activeSlots.has(pending.slotNo)) continue;
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
            const currentOwnedBySnapshot = current?.source !== "KAKAO" || (
              current.sourceRoomIdHash !== null && sameBytes(current.sourceRoomIdHash, sourceRoomIdHash) &&
              current.sourceMode === sourceMode
            );
            const mergePlan = currentOwnedBySnapshot
              ? planSeasonApplicationMerge(current ?? null)
              : { action: "PRESERVE" as const, outcome: "REVIEWED_PRESERVED" as const };
            if (mergePlan.action === "REFRESH_KAKAO") {
              const changed = current.sourceSlotNo !== participant.slotNo ||
                current.mainPosition !== participant.mainPosition ||
                !sameStrings(current.subPositions, participant.subPositions) ||
                current.status !== "APPLIED" || current.cancelledAt !== null;
              if (changed) {
                await transaction.update(seasonApplications).set({
                  sourceSlotNo: participant.slotNo,
                  mainPosition: participant.mainPosition,
                  subPositions: [...participant.subPositions],
                  status: "APPLIED",
                  sourceReferenceHash: sourceHash,
                  sourceRoomIdHash,
                  sourceMode,
                  cancelledAt: null,
                  revision: sql`${seasonApplications.revision} + 1`,
                  updatedAt: now,
                }).where(eq(seasonApplications.id, current.id));
                updatedCount += 1;
              }
            } else if (mergePlan.action === "CREATE_KAKAO") {
              await transaction.insert(seasonApplications).values({
                id: randomUUID(), seasonId: command.seasonId, playerId: matchedPlayer.id,
                applyDate: command.applyDate, recruitNo: command.recruitNo, sourceSlotNo: participant.slotNo,
                mainPosition: participant.mainPosition, subPositions: [...participant.subPositions], status: "APPLIED",
                source: "KAKAO", sourceReferenceHash: sourceHash, sourceRoomIdHash, sourceMode,
                createdAt: now, updatedAt: now,
              });
              createdCount += 1;
            }
            const existingPending = currentPending.find((pending) => pending.slotNo === participant.slotNo);
            if (existingPending?.status === "ACTIVE") {
              await transaction.update(seasonKakaoPendingApplications).set({
                status: "RESOLVED", resolvedAt: now, cancelledAt: null,
                revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
              }).where(eq(seasonKakaoPendingApplications.id, existingPending.id));
              updatedCount += 1;
            }
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
            sourceRoomIdHash,
            sourceMode,
            cancelledAt: null,
            resolvedAt: null,
            updatedAt: now,
          };
          const existing = currentPending.find((pending) => pending.slotNo === participant.slotNo);
          if (existing) {
            const changed = existing.matchedPlayerId !== pendingValues.matchedPlayerId ||
              existing.suppliedName !== pendingValues.suppliedName ||
              existing.suppliedRiotId !== pendingValues.suppliedRiotId ||
              existing.mainPosition !== pendingValues.mainPosition ||
              !sameStrings(existing.subPositions, pendingValues.subPositions) ||
              existing.reserve !== pendingValues.reserve || existing.matchState !== pendingValues.matchState ||
              existing.status !== "ACTIVE" || existing.cancelledAt !== null || existing.resolvedAt !== null;
            if (changed) {
              await transaction.update(seasonKakaoPendingApplications).set({
                ...pendingValues, revision: sql`${seasonKakaoPendingApplications.revision} + 1`,
              }).where(eq(seasonKakaoPendingApplications.id, existing.id));
              updatedCount += 1;
            }
          } else {
            await transaction.insert(seasonKakaoPendingApplications).values({
              id: randomUUID(), seasonId: command.seasonId, applyDate: command.applyDate,
              recruitNo: command.recruitNo, slotNo: participant.slotNo, createdAt: now,
              ...pendingValues,
            });
            createdCount += 1;
          }
        }
        await transaction.insert(auditEvents).values({
          requestId: input.requestId,
          action: "KAKAO_SEASON_SNAPSHOT_SYNCED",
          targetType: "SEASON_RECRUIT_ROUND",
          targetId: roundKey,
          metadataJson: {
            participantCount: command.participants.length,
            createdCount,
            updatedCount,
            cancelledCount,
            sourceDigest: input.intent.bodyDigestHex,
            sourceRoomDigest: roomScope,
            sourceMode,
          },
          createdAt: now,
        });
      } else if (command.action === "CANCEL") {
        const cancelled = await transaction.update(seasonApplications).set({
          status: "CANCELLED", cancelledAt: now, revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
        }).where(and(
          eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo), eq(seasonApplications.source, "KAKAO"),
          eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash), eq(seasonApplications.sourceMode, sourceMode),
          eq(seasonApplications.status, "APPLIED"),
        )).returning({ id: seasonApplications.id });
        const pending = await transaction.update(seasonKakaoPendingApplications).set({
          status: "CANCELLED", cancelledAt: now, revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
        }).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )).returning({ id: seasonKakaoPendingApplications.id });
        cancelledCount = cancelled.length + pending.length;
        await transaction.insert(auditEvents).values({
          requestId: input.requestId, action: "KAKAO_SEASON_SNAPSHOT_CANCELLED",
          targetType: "SEASON_RECRUIT_ROUND", targetId: roundKey,
          metadataJson: { cancelledCount, sourceRoomDigest: roomScope, sourceMode }, createdAt: now,
        });
      }

      const applications = await transaction.select({ application: seasonApplications, player: players }).from(seasonApplications)
        .innerJoin(players, eq(players.id, seasonApplications.playerId)).where(and(
          eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.applyDate, command.applyDate),
          command.recruitNo === null ? undefined : eq(seasonApplications.recruitNo, command.recruitNo),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
          or(
            eq(seasonApplications.source, "SITE"),
            and(eq(seasonApplications.source, "KAKAO"), eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash), eq(seasonApplications.sourceMode, sourceMode)),
          ),
        )).orderBy(asc(seasonApplications.recruitNo), asc(seasonApplications.sourceSlotNo), asc(seasonApplications.createdAt), asc(seasonApplications.id));
      const pending = await transaction.select({ pending: seasonKakaoPendingApplications, player: players }).from(seasonKakaoPendingApplications)
        .leftJoin(players, eq(players.id, seasonKakaoPendingApplications.matchedPlayerId)).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          command.recruitNo === null ? undefined : eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
        )).orderBy(asc(seasonKakaoPendingApplications.recruitNo), asc(seasonKakaoPendingApplications.slotNo), asc(seasonKakaoPendingApplications.createdAt), asc(seasonKakaoPendingApplications.id));
      const legacyEntries: LegacySeasonEntry[] = [
        ...applications.map(({ application, player }) => ({
          recruitNo: application.recruitNo,
          slotNo: application.sourceSlotNo,
          reserve: application.status === "RESERVE",
          name: player.memberName,
          currentTier: player.currentTier,
          peakTier: player.peakTier,
          mainPosition: application.mainPosition,
          subPositions: application.subPositions,
          createdAt: application.createdAt,
        })),
        ...pending.map(({ pending: item, player }) => ({
          recruitNo: item.recruitNo,
          slotNo: item.slotNo,
          reserve: item.reserve,
          name: item.suppliedName,
          currentTier: player?.currentTier ?? null,
          peakTier: player?.peakTier ?? null,
          mainPosition: item.mainPosition,
          subPositions: item.subPositions,
          createdAt: item.createdAt,
        })),
      ];
      const legacyGrouped = new Map<number, LegacySeasonEntry[]>();
      for (const entry of legacyEntries) {
        const group = legacyGrouped.get(entry.recruitNo) ?? [];
        group.push(entry);
        legacyGrouped.set(entry.recruitNo, group);
      }
      if (command.action === "STATUS" && command.recruitNo === null) {
        const availableRecruitNos = [...legacyGrouped.keys()].sort((left, right) => left - right);
        return Object.freeze({
          kind: "SEASON_APPLICATION_SNAPSHOT" as const,
          seasonId: command.seasonId,
          applyDate: command.applyDate,
          recruitNo: null,
          entries: Object.freeze([]),
          appliedCount: applications.filter(({ application }) => application.status === "APPLIED").length,
          reserveCount: applications.filter(({ application }) => application.status === "RESERVE").length +
            pending.filter(({ pending: item }) => item.matchState === "MATCHED_RESERVE").length,
          confirmedCount: applications.filter(({ application }) => application.status === "CONFIRMED").length,
          pendingCount: pending.filter(({ pending: item }) => item.matchState !== "MATCHED_RESERVE").length,
          cancelledCount: 0,
          availableRecruitNos: Object.freeze(availableRecruitNos),
          legacyReply: legacyInhouseOverview(command.applyDate, legacyGrouped),
        });
      }
      const entries: KakaoSeasonSnapshotEntryDto[] = [
        ...applications.map(({ application, player }) => ({
          slotNo: application.sourceSlotNo ?? 999,
          status: application.status,
          source: application.source,
          suppliedName: player.nickname,
          suppliedRiotId: `${player.nickname}#${player.tagLine}`,
          mainPosition: application.mainPosition,
          subPositions: application.subPositions,
          player: { playerId: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` },
        })),
        ...pending.map(({ pending: item, player }) => ({
          slotNo: item.slotNo,
          status: item.matchState,
          source: "KAKAO" as const,
          suppliedName: item.suppliedName,
          suppliedRiotId: item.suppliedRiotId,
          mainPosition: item.mainPosition,
          subPositions: item.subPositions,
          player: player ? { playerId: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` } : null,
        })),
      ];
      entries.sort((left, right) => left.slotNo - right.slotNo || left.suppliedName.localeCompare(right.suppliedName, "ko"));
      const usedSlots = new Set<number>();
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]!;
        let slotNo = entry.slotNo;
        if (!Number.isSafeInteger(slotNo) || slotNo < 1 || slotNo > 99 || usedSlots.has(slotNo)) {
          slotNo = 1;
          while (usedSlots.has(slotNo)) slotNo += 1;
        }
        usedSlots.add(slotNo);
        if (slotNo !== entry.slotNo) entries[index] = { ...entry, slotNo };
      }
      entries.sort((left, right) => left.slotNo - right.slotNo || left.suppliedName.localeCompare(right.suppliedName, "ko"));
      return Object.freeze({
        kind: "SEASON_APPLICATION_SNAPSHOT" as const,
        seasonId: command.seasonId,
        applyDate: command.applyDate,
        recruitNo: command.recruitNo,
        entries: Object.freeze(entries),
        appliedCount: applications.filter(({ application }) => application.status === "APPLIED").length,
        reserveCount: applications.filter(({ application }) => application.status === "RESERVE").length +
          pending.filter(({ pending: item }) => item.matchState === "MATCHED_RESERVE").length,
        confirmedCount: applications.filter(({ application }) => application.status === "CONFIRMED").length,
        pendingCount: pending.filter(({ pending: item }) => item.matchState !== "MATCHED_RESERVE").length,
        cancelledCount,
        ...(command.action === "STATUS" ? {} : { createdCount, updatedCount, mode: sourceMode }),
        ...(command.action === "STATUS" && command.recruitNo !== null ? {
          legacyReply: legacyInhouseDetail(command.applyDate, command.recruitNo, legacyEntries),
        } : {}),
      });
    });
  }
}
