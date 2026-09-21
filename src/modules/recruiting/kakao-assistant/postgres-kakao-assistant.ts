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
import { seasonApplications, seasonInhouseRounds, seasonKakaoPendingApplications, seasons } from "@/platform/db/schema/seasons";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import { planSeasonApplicationMerge } from "@/modules/seasons/domain/application-source-policy";
import { recruitingOperatingDateKey } from "../domain/operating-day";
import { kakaoRecruitTimeText } from "../domain/recruiting";
import { issueKakaoFormSnapshot, loadKakaoFormSnapshot } from "../infrastructure/kakao-form-snapshots";
import { partyCopySnapshot } from "../application/party-copy-snapshot";
import { planInhouseCopyAdditions, type InhouseCopyRow } from "./inhouse-copy-form";
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
  type KakaoSeasonSnapshotParticipant,
  type KakaoSeasonSnapshotDto,
  type KakaoSeasonSnapshotEntryDto,
  type KakaoSeasonRoundMetadataDto,
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
  pending?: boolean;
}>;

type LegacySeasonRoundMetadata = KakaoSeasonRoundMetadataDto;

const INHOUSE_MODES = ["RIFT", "ARAM", "AUGMENT_ARAM"] as const;

function toSeasonRoundMetadata(
  row: typeof seasonInhouseRounds.$inferSelect,
): KakaoSeasonRoundMetadataDto {
  return Object.freeze({
    recruitNo: row.recruitNo,
    mode: row.mode as KakaoSeasonRoundMetadataDto["mode"],
    capacity: row.capacity,
    startTimeText: row.startTimeText,
    scheduledStartAt: row.scheduledStartAt?.toISOString() ?? null,
    gameInfo: row.gameInfo,
    organizerText: row.organizerText,
    noticeText: row.noticeText,
    revision: row.revision,
  });
}

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

function legacyInhouseEntryLine(prefix: string, entry: LegacySeasonEntry | null, namesOnly = false) {
  if (!entry) return `${prefix}.`;
  const name = entry.name.normalize("NFKC").replace(/[\r\n/]+/gu, " ").replace(/\s+/gu, " ").trim();
  return namesOnly
    ? `${prefix}. ${name}`
    : `${prefix}. ${name}/${legacyInhouseTier(entry.currentTier)}/${legacyInhouseTier(entry.peakTier)}/${legacyInhousePositions(entry)}`;
}

function legacyInhouseModeLabel(mode: LegacySeasonRoundMetadata["mode"] | undefined) {
  if (mode === "ARAM") return "칼바람";
  if (mode === "AUGMENT_ARAM") return "증바람";
  return "협곡";
}

function legacyInhouseStartTime(metadata: LegacySeasonRoundMetadata | undefined) {
  if (metadata?.startTimeText) return metadata.startTimeText;
  if (metadata?.scheduledStartAt) {
    const scheduled = new Date(metadata.scheduledStartAt);
    if (!Number.isNaN(scheduled.getTime())) {
      const kst = new Date(scheduled.getTime() + 9 * 60 * 60 * 1_000);
      return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
    }
  }
  return "미정";
}

function oneLineInhouseNotice(value: string) {
  return value.replace(/[\r\n]+/gu, " / ").replace(/\s+/gu, " ").trim();
}

function legacyInhouseDetail(
  applyDate: string,
  recruitNo: number,
  entries: readonly LegacySeasonEntry[],
  metadata?: LegacySeasonRoundMetadata,
  copyState?: Readonly<{ operatingDate: string; saveReference: string; formCode?: string }>,
) {
  const mainEntries = entries.filter((entry) => !entry.reserve).sort(compareLegacySeasonEntries);
  const reserveEntries = entries.filter((entry) => entry.reserve).sort(compareLegacySeasonEntries);
  const capacity = metadata?.capacity ?? LEGACY_INHOUSE_CAPACITY;
  const namesOnly = true;
  const slots: Array<LegacySeasonEntry | null> = Array.from({ length: capacity }, () => null);
  const overflow: LegacySeasonEntry[] = [];
  for (const entry of mainEntries) {
    if (entry.slotNo !== null && entry.slotNo >= 1 && entry.slotNo <= capacity && !slots[entry.slotNo - 1]) {
      slots[entry.slotNo - 1] = entry;
      continue;
    }
    const emptyIndex = slots.findIndex((candidate) => candidate === null);
    if (emptyIndex >= 0) slots[emptyIndex] = entry;
    else overflow.push(entry);
  }
  const lines = [
    `[내전 #${recruitNo}] ${mainEntries.length}/${capacity}명`,
    `》모드: ${legacyInhouseModeLabel(metadata?.mode)}`,
    `》시작: ${legacyInhouseStartTime(metadata)}`,
    ...(metadata?.gameInfo && metadata.gameInfo !== "미입력" ? [`》게임정보: ${metadata.gameInfo}`] : []),
    ...(metadata?.noticeText ? [`》공지: ${oneLineInhouseNotice(metadata.noticeText)}`] : []),
    "",
    "전체 복사 → 빈칸에 이름 → 전체 전송",
    ...(metadata?.mode === "RIFT" ? ["라인 선택: 이름/주라인/부라인"] : []),
  ];
  lines.push("");
  slots.forEach((entry, index) => lines.push(legacyInhouseEntryLine(String(index + 1), entry, namesOnly)));
  overflow.forEach((entry, index) => lines.push(legacyInhouseEntryLine(String(capacity + index + 1), entry, namesOnly)));
  lines.push("");
  reserveEntries.forEach((entry, index) => lines.push(legacyInhouseEntryLine(`예비 ${entry.slotNo && entry.slotNo > capacity ? entry.slotNo - capacity : index + 1}`, entry, namesOnly)));
  const occupiedReserveSlots = reserveEntries
    .map((entry, index) => entry.slotNo && entry.slotNo > capacity ? entry.slotNo - capacity : index + 1);
  let nextReserve = 1;
  while (occupiedReserveSlots.includes(nextReserve)) nextReserve += 1;
  if (nextReserve <= capacity) lines.push(`예비 ${nextReserve}.`);
  if (copyState?.formCode) lines.push("", `양식코드: ${copyState.formCode}`);
  else if (copyState) lines.push("", `저장기준: ${copyState.operatingDate} / ${copyState.saveReference}`);
  return lines.join("\n");
}

function legacyInhouseOverview(
  applyDate: string,
  grouped: ReadonlyMap<number, readonly LegacySeasonEntry[]>,
  metadataByRecruitNo: ReadonlyMap<number, LegacySeasonRoundMetadata>,
) {
  const recruitNos = [...new Set([...grouped.keys(), ...metadataByRecruitNo.keys()])].sort((left, right) => left - right);
  if (recruitNos.length === 0) {
    return "[K-LOL.GG 내전현황]\n오늘 등록된 내전 신청이 없습니다.\n\n참가 신청: 내전참가";
  }
  const lines = ["[K-LOL.GG 내전현황]", "🔎 전체 명단: 내전상세 번호", ""];
  for (const recruitNo of recruitNos) {
    const entries = grouped.get(recruitNo) ?? [];
    const metadata = metadataByRecruitNo.get(recruitNo);
    const mainCount = entries.filter((entry) => !entry.reserve).length;
    const reserveCount = entries.filter((entry) => entry.reserve).length;
    const reserveText = reserveCount > 0 ? ` / 예비 ${reserveCount}` : "";
    const modeText = metadata ? ` · ${legacyInhouseModeLabel(metadata.mode)}` : "";
    lines.push(`#${recruitNo} ${legacyInhouseDate(applyDate)} ${legacyInhouseStartTime(metadata)} 시작${modeText} (${mainCount}/${metadata?.capacity ?? LEGACY_INHOUSE_CAPACITY}${reserveText})`);
    if (metadata?.noticeText) lines.push(`공지: ${oneLineInhouseNotice(metadata.noticeText)}`);
    lines.push(`└ 내전상세 ${recruitNo}`);
  }
  lines.push("", `상세 명령: ${recruitNos.map((recruitNo) => `내전상세 ${recruitNo}`).join(" / ")}`);
  return lines.join("\n");
}

function v1StrictLegacyInhouseStatus(
  applyDate: string,
  grouped: ReadonlyMap<number, readonly LegacySeasonEntry[]>,
  metadataByRecruitNo: ReadonlyMap<number, LegacySeasonRoundMetadata>,
  copyStates?: ReadonlyMap<number, Readonly<{ operatingDate: string; saveReference: string; formCode?: string }>>,
) {
  const recruitNos = [...new Set([...grouped.keys(), ...metadataByRecruitNo.keys()])].sort((left, right) => left - right);
  if (recruitNos.length === 0) return "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
  if (recruitNos.length === 1) {
    const recruitNo = recruitNos[0]!;
    return legacyInhouseDetail(applyDate, recruitNo, grouped.get(recruitNo) ?? [], metadataByRecruitNo.get(recruitNo), copyStates?.get(recruitNo));
  }
  return legacyInhouseOverview(applyDate, grouped, metadataByRecruitNo);
}

type LegacySeasonSyncChanges = {
  added: string[];
  updated: string[];
  removed: string[];
  pending: string[];
  reserve: string[];
  currentMainCount: number;
  metadataChanged: boolean;
  roundMetadata: LegacySeasonRoundMetadata | null;
};

function legacySeasonParticipantLabel(
  participant: KakaoSeasonSnapshotParticipant,
  playerName?: string | null,
  capacity = LEGACY_INHOUSE_CAPACITY,
) {
  const reserveSlot = participant.slotNo > capacity ? participant.slotNo - capacity : participant.slotNo;
  const prefix = participant.reserve ? `예비 ${reserveSlot}` : String(participant.slotNo);
  return `${prefix}. ${String(playerName || participant.name).normalize("NFKC").replace(/[\r\n/]+/gu, " ").replace(/\s+/gu, " ").trim()}`;
}

function compactLegacySeasonChanges(items: readonly string[]) {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (normalized.length <= 6) return normalized.join(", ");
  return `${normalized.slice(0, 6).join(", ")} 외 ${normalized.length - 6}명`;
}

function legacySeasonSyncReply(recruitNo: number, changes: LegacySeasonSyncChanges) {
  const hasChanges = changes.added.length > 0 || changes.updated.length > 0 || changes.removed.length > 0 ||
    changes.pending.length > 0 || changes.reserve.length > 0;
  if (!hasChanges && !changes.metadataChanged) return "명단 변경이 없습니다. 참가하려면 번호 옆 빈칸에 이름을 적어주세요.";
  const lines: string[] = [];
  for (const [label, items] of [
    ["신청 저장", [...changes.added, ...changes.pending]],
    ["신청 변경 저장", changes.updated],
    ["신청 취소", changes.removed],
    ["예비 신청 저장", changes.reserve],
  ] as const) {
    const text = compactLegacySeasonChanges(items);
    if (text) lines.push(`${label}: ${text}`);
  }
  if (lines.length === 0) lines.push(`내전 #${recruitNo} 정보 저장`);
  return lines.join("\n");
}

/** Read under the existing season/round transaction locks, including SITE roster changes. */
async function inhouseCopyState(
  transaction: V2Transaction,
  scope: Readonly<{ seasonId: string; applyDate: string; recruitNo: number; sourceRoomIdHash: Buffer }>,
) {
  const rounds = await transaction.select().from(seasonInhouseRounds).where(and(
    eq(seasonInhouseRounds.seasonId, scope.seasonId), eq(seasonInhouseRounds.applyDate, scope.applyDate),
    eq(seasonInhouseRounds.recruitNo, scope.recruitNo), eq(seasonInhouseRounds.sourceRoomIdHash, scope.sourceRoomIdHash),
  )).orderBy(asc(seasonInhouseRounds.id)).for("update");
  const applications = await transaction.select({ application: seasonApplications, player: players })
    .from(seasonApplications).innerJoin(players, eq(players.id, seasonApplications.playerId)).where(and(
      eq(seasonApplications.seasonId, scope.seasonId), eq(seasonApplications.applyDate, scope.applyDate),
      eq(seasonApplications.recruitNo, scope.recruitNo),
      or(eq(seasonApplications.source, "SITE"), eq(seasonApplications.sourceRoomIdHash, scope.sourceRoomIdHash)),
      inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
    )).orderBy(asc(seasonApplications.id)).for("update");
  const pending = await transaction.select().from(seasonKakaoPendingApplications).where(and(
    eq(seasonKakaoPendingApplications.seasonId, scope.seasonId), eq(seasonKakaoPendingApplications.applyDate, scope.applyDate),
    eq(seasonKakaoPendingApplications.recruitNo, scope.recruitNo),
    eq(seasonKakaoPendingApplications.sourceRoomIdHash, scope.sourceRoomIdHash), eq(seasonKakaoPendingApplications.status, "ACTIVE"),
  )).orderBy(asc(seasonKakaoPendingApplications.id)).for("update");
  const saveReference = `S${createHash("sha256").update(JSON.stringify({
    scope: [scope.seasonId, scope.applyDate, scope.recruitNo, scope.sourceRoomIdHash.toString("hex")],
    rounds: rounds.map((row) => [row.id, row.revision, row.status]),
    applications: applications.map(({ application, player }) => [application.id, application.revision, player.memberName]),
    pending: pending.map((row) => [row.id, row.revision]),
  })).digest("hex").slice(0, 32)}`;
  const round = rounds.find((row) => row.status === "IN_PROGRESS") ?? rounds.find((row) => row.status === "DRAFT") ?? rounds[0];
  const rows: InhouseCopyRow[] = [
    ...applications.filter(({ application }) => application.source === "SITE" || application.sourceMode === round?.mode)
      .map(({ application, player }) => ({
        slotNo: application.sourceSlotNo ?? 0, name: player.memberName,
        reserve: application.status === "RESERVE", pending: false,
        mainPosition: application.mainPosition, subPositions: application.subPositions,
      })),
    ...pending.filter((row) => row.sourceMode === round?.mode).map((row) => ({
      slotNo: row.slotNo, name: row.suppliedName, reserve: row.reserve,
      pending: row.matchState !== "MATCHED_RESERVE", mainPosition: row.mainPosition, subPositions: row.subPositions,
    })),
  ];
  const occupied = new Set(rows.filter((row) => row.slotNo > 0).map((row) => row.slotNo));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (row.slotNo > 0) continue;
    let slotNo = row.reserve ? (round?.capacity ?? 10) + 1 : 1;
    while (occupied.has(slotNo)) slotNo += 1;
    rows[index] = { ...row, slotNo };
    occupied.add(slotNo);
  }
  rows.sort((left, right) => left.slotNo - right.slotNo);
  const snapshot = {
    roundId: round?.id ?? `${scope.seasonId}:${scope.applyDate}:${scope.recruitNo}`, mode: round?.mode ?? "RIFT", status: round?.status ?? "IN_PROGRESS",
    capacity: round?.capacity ?? 10, startTimeText: round?.startTimeText ?? null,
    gameInfo: round?.gameInfo ?? null, organizerText: round?.organizerText ?? null,
    noticeText: round?.noticeText ? oneLineInhouseNotice(round.noticeText) : null,
    rows: rows.map((row) => ({ ...row, subPositions: [...row.subPositions] })),
  };
  return { saveReference, rounds, applications, pending, rows, snapshot, round };
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

  getOpenChatStatus(input: SignedReadInput & Readonly<{
    projection?: "PARTY" | "SCRIM";
    now?: Date;
    afterMutation?: boolean;
  }>): Promise<KakaoAssistantResult<KakaoOpenChatStatusDto>> {
    const query = async (transaction: V2Transaction) => {
      const statusNow = input.now ?? new Date(input.intent.timestampSeconds * 1_000);
      const operatingDate = recruitingOperatingDateKey(statusNow);
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
          organizerText: recruitParties.organizerText,
          scheduledStartAt: recruitParties.scheduledStartAt,
        }).from(recruitParties).where(and(
          eq(recruitParties.status, "IN_PROGRESS"),
          eq(recruitParties.sourceRoomId, input.intent.roomId),
          eq(recruitParties.recruitDate, operatingDate),
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
          organizerText: scrimRecruits.organizerText,
          status: scrimRecruits.status,
          bestOf: scrimRecruits.bestOf,
          scheduledAt: scrimRecruits.scheduledAt,
        }).from(scrimRecruits).where(and(
          eq(scrimRecruits.isDraft, false),
          inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]),
          eq(scrimRecruits.sourceRoomId, input.intent.roomId),
          eq(scrimRecruits.recruitDate, operatingDate),
        ))
          .orderBy(desc(scrimRecruits.recruitDate), asc(scrimRecruits.scrimNumber)).limit(MAXIMUM_STATUS_RESULTS + 1);
      const latestPartyRows = input.projection ? [] : await transaction.select({ resetSequence: recruitParties.resetSequence, recruitNumber: recruitParties.recruitNumber })
          .from(recruitParties).where(eq(recruitParties.recruitDate, operatingDate))
          .orderBy(desc(recruitParties.resetSequence), desc(recruitParties.recruitNumber)).limit(1);
      const latestScrimRows = input.projection ? [] : await transaction.select({ scrimNumber: scrimRecruits.scrimNumber })
          .from(scrimRecruits).where(eq(scrimRecruits.recruitDate, operatingDate))
          .orderBy(desc(scrimRecruits.scrimNumber)).limit(1);
      const parties = partyRows.slice(0, MAXIMUM_STATUS_RESULTS);
      const scrims = scrimRows.slice(0, MAXIMUM_STATUS_RESULTS);
      const latestParty = latestPartyRows[0];
      const latestScrim = latestScrimRows[0];
      const partyFormCodes = new Map<string, string>();
      for (const party of parties) {
        const formCode = await issueKakaoFormSnapshot(transaction, {
          kind: "PARTY", scopeHash: createHash("sha256").update(input.intent.roomId).digest(),
          targetId: party.id, operatingDate, now: statusNow,
          state: partyCopySnapshot({ ...party, members: publicRecruitMembers(party.members) }),
        });
        partyFormCodes.set(party.id, formCode);
      }
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
            formCode: partyFormCodes.get(party.id),
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
            organizerText: party.organizerText,
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
          organizerText: scrim.organizerText,
          status: scrim.status as "RECRUITING" | "MATCHED" | "CONFIRMED",
          bestOf: scrim.bestOf ?? 3,
          scheduledAt: scrim.scheduledAt?.toISOString() ?? null,
        }))),
      });
    };
    if (input.afterMutation) {
      return withTransaction(this.database, async (transaction) => ({ body: await query(transaction), replayed: false }));
    }
    return this.execute(input, query);
  }

  getScheduledNotice(input: SignedReadInput & Readonly<{ slot: string | null; now?: Date }>): Promise<KakaoAssistantResult<KakaoScheduledNoticeDto>> {
    return this.execute(input, async (transaction) => {
      const now = input.now ?? new Date();
      const date = recruitingOperatingDateKey(now);
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
      if (command.action === "SYNC" || command.action === "RESERVE") {
        const preserved = command.action === "SYNC" ? command.preserveSlotNos ?? [] : [];
        const roundMetadata = command.roundMetadata ?? {
          capacity: LEGACY_INHOUSE_CAPACITY,
          startTimeText: null,
          scheduledStartAt: null,
          gameInfo: null,
          organizerText: null,
          noticeText: null,
        };
        if (
          preserved.some((slotNo) => !Number.isSafeInteger(slotNo) || slotNo < 1 || slotNo > 99) ||
          new Set(preserved).size !== preserved.length ||
          command.participants.some((participant) => preserved.includes(participant.slotNo)) ||
          !Number.isSafeInteger(roundMetadata.capacity) || roundMetadata.capacity < 2 || roundMetadata.capacity > 20 ||
          command.participants.some((participant) => participant.slotNo > roundMetadata.capacity * (participant.reserve ? 2 : 1)) ||
          (roundMetadata.startTimeText !== null && (roundMetadata.startTimeText.trim().length < 1 ||
            roundMetadata.startTimeText.length > 32 || /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u.test(roundMetadata.startTimeText))) ||
          (roundMetadata.scheduledStartAt !== null && Number.isNaN(new Date(roundMetadata.scheduledStartAt).getTime())) ||
          (roundMetadata.gameInfo != null && (roundMetadata.gameInfo.trim().length < 1 || roundMetadata.gameInfo.length > 500)) ||
          (roundMetadata.organizerText != null && (roundMetadata.organizerText.trim().length < 1 || roundMetadata.organizerText.length > 100)) ||
          (roundMetadata.noticeText !== null && (roundMetadata.noticeText.length < 1 || roundMetadata.noticeText.length > 600))
        ) throw new KakaoAssistantError("INVALID_INPUT");
      }
      if (command.action !== "STATUS") {
        if (command.action === "SYNC" && command.copyGuard && command.applyDate !== recruitingOperatingDateKey(now)) {
          throw new KakaoAssistantError("PRECONDITION_FAILED");
        }
        if (season.status !== "ACTIVE" ||
            (season.applicationsOpenAt && season.applicationsOpenAt > now) ||
            (season.applicationsCloseAt && season.applicationsCloseAt <= now) ||
            command.applyDate !== recruitingOperatingDateKey(now)) {
          throw new KakaoAssistantError("CONFLICT");
        }
      }
      const sourceRoomIdHash = seasonRoomIdHash(input.intent.roomId);
      const roomScope = sourceRoomIdHash.toString("hex");
      if (command.action === "RESERVE") {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-season-reserve:${command.seasonId}:${command.applyDate}:${roomScope}`}, 0))`);
        const latest = (await transaction.select({ recruitNo: seasonInhouseRounds.recruitNo }).from(seasonInhouseRounds).where(and(
          eq(seasonInhouseRounds.seasonId, command.seasonId),
          eq(seasonInhouseRounds.applyDate, command.applyDate),
          eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
        )).orderBy(desc(seasonInhouseRounds.recruitNo)).limit(1))[0];
        const recruitNo = command.recruitNo ?? (latest ? latest.recruitNo + 1 : 1);
        if (!Number.isSafeInteger(recruitNo) || recruitNo < 1 || recruitNo > 999) throw new KakaoAssistantError("CONFLICT");
        const duplicate = (await transaction.select({ id: seasonInhouseRounds.id }).from(seasonInhouseRounds).where(and(
          eq(seasonInhouseRounds.seasonId, command.seasonId),
          eq(seasonInhouseRounds.applyDate, command.applyDate),
          eq(seasonInhouseRounds.recruitNo, recruitNo),
          eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
        )).limit(1))[0];
        if (duplicate) throw new KakaoAssistantError("CONFLICT");
        const metadata = command.roundMetadata;
        const row = (await transaction.insert(seasonInhouseRounds).values({
          id: randomUUID(), seasonId: command.seasonId, applyDate: command.applyDate, recruitNo,
          sourceRoomIdHash, mode: command.mode, status: "DRAFT", capacity: metadata.capacity,
          startTimeText: metadata.startTimeText,
          scheduledStartAt: metadata.scheduledStartAt ? new Date(metadata.scheduledStartAt) : null,
          gameInfo: metadata.gameInfo, organizerText: metadata.organizerText, noticeText: metadata.noticeText,
          sourceReferenceHash: Buffer.from(input.intent.bodyDigestHex, "hex"), createdAt: now, updatedAt: now,
        }).returning())[0]!;
        const copyState = await inhouseCopyState(transaction, { seasonId: command.seasonId, applyDate: command.applyDate, recruitNo, sourceRoomIdHash });
        const formCode = await issueKakaoFormSnapshot(transaction, {
          kind: "INHOUSE", scopeHash: sourceRoomIdHash, targetId: row.id,
          operatingDate: recruitingOperatingDateKey(now), state: copyState.snapshot, now,
        });
        return Object.freeze({
          kind: "SEASON_APPLICATION_SNAPSHOT" as const, seasonId: command.seasonId, applyDate: command.applyDate,
          recruitNo, entries: Object.freeze([]), appliedCount: 0, reserveCount: 0, confirmedCount: 0,
          pendingCount: 0, cancelledCount: 0, createdCount: 0, updatedCount: 0, mode: command.mode,
          metadataUpdated: true, roundMetadata: toSeasonRoundMetadata(row),
          operatingDate: recruitingOperatingDateKey(now), saveReference: copyState.saveReference, formCode,
        });
      }
      const roundKey = `${command.seasonId}:${command.applyDate}:${command.recruitNo ?? "all"}:${roomScope}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-season:${roundKey}`}, 0))`);

      let cancelledCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let metadataUpdated = false;
      if (command.action === "FINISH") {
        const activeRounds = await transaction.select().from(seasonInhouseRounds).where(and(
          eq(seasonInhouseRounds.seasonId, command.seasonId),
          eq(seasonInhouseRounds.applyDate, command.applyDate),
          eq(seasonInhouseRounds.recruitNo, command.recruitNo),
          eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonInhouseRounds.status, "IN_PROGRESS"),
        )).orderBy(asc(seasonInhouseRounds.id)).for("update");
        if (activeRounds.length === 0) throw new KakaoAssistantError("NOT_FOUND");
        const roundIds = activeRounds.map((round) => round.id);
        const modes = [...new Set(activeRounds.map((round) => round.mode))];
        const closedRounds = await transaction.update(seasonInhouseRounds).set({
          status: "CANCELED",
          sourceReferenceHash: Buffer.from(input.intent.bodyDigestHex, "hex"),
          revision: sql`${seasonInhouseRounds.revision} + 1`,
          updatedAt: now,
        }).where(and(
          inArray(seasonInhouseRounds.id, roundIds),
          eq(seasonInhouseRounds.status, "IN_PROGRESS"),
        )).returning({ id: seasonInhouseRounds.id });
        if (closedRounds.length !== activeRounds.length) throw new KakaoAssistantError("CONFLICT");
        const cancelledApplications = await transaction.update(seasonApplications).set({
          status: "CANCELLED",
          cancelledAt: now,
          reviewNote: null,
          reviewedByUserAccountId: null,
          reviewedAt: null,
          revision: sql`${seasonApplications.revision} + 1`,
          updatedAt: now,
        }).where(and(
          eq(seasonApplications.seasonId, command.seasonId),
          eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo),
          eq(seasonApplications.source, "KAKAO"),
          eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
          inArray(seasonApplications.sourceMode, modes),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE"]),
        )).returning({ id: seasonApplications.id });
        const cancelledPending = await transaction.update(seasonKakaoPendingApplications).set({
          status: "CANCELLED",
          cancelledAt: now,
          revision: sql`${seasonKakaoPendingApplications.revision} + 1`,
          updatedAt: now,
        }).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          inArray(seasonKakaoPendingApplications.sourceMode, modes),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )).returning({ id: seasonKakaoPendingApplications.id });
        cancelledCount = cancelledApplications.length + cancelledPending.length;
        metadataUpdated = true;
        await transaction.insert(auditEvents).values({
          requestId: input.requestId,
          action: "KAKAO_SEASON_ROUND_FINISHED",
          targetType: "SEASON_RECRUIT_ROUND",
          targetId: roundKey,
          metadataJson: {
            cancelledCount,
            closedRoundCount: closedRounds.length,
            sourceRoomDigest: roomScope,
            modes,
          },
          createdAt: now,
        });
      }

      const commandMode = command.action === "SYNC" || command.action === "CANCEL"
        ? command.mode
        : command.action === "ADD_PARTICIPANT" || command.action === "REMOVE_PARTICIPANT"
          ? ((await transaction.select({ mode: seasonInhouseRounds.mode }).from(seasonInhouseRounds).where(and(
              eq(seasonInhouseRounds.seasonId, command.seasonId), eq(seasonInhouseRounds.applyDate, command.applyDate),
              eq(seasonInhouseRounds.recruitNo, command.recruitNo), eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
              eq(seasonInhouseRounds.status, "IN_PROGRESS"),
            )).limit(1))[0]?.mode as typeof INHOUSE_MODES[number] | undefined)
          : undefined;
      if ((command.action === "ADD_PARTICIPANT" || command.action === "REMOVE_PARTICIPANT") && !commandMode) {
        throw new KakaoAssistantError("NOT_FOUND");
      }
      const sourceMode = command.action === "STATUS" || command.action === "FINISH" ? "RIFT" as const : commandMode!;
      // The advisory lock above serializes all mode corrections and manual
      // finishes for the same visible room/date/round.
      const legacyChanges: LegacySeasonSyncChanges = {
        added: [],
        updated: [],
        removed: [],
        pending: [],
        reserve: [],
        currentMainCount: requested.action === "SYNC" ? requested.participants.filter((participant) => !participant.reserve).length : 0,
        metadataChanged: false,
        roundMetadata: null,
      };
      if (command.action === "ADD_PARTICIPANT" || command.action === "REMOVE_PARTICIPANT") {
        const positionsSpecified = command.action === "ADD_PARTICIPANT" &&
          (command.mainPosition !== undefined || command.subPositions !== undefined);
        if (positionsSpecified && (command.mainPosition === undefined || sourceMode !== "RIFT")) {
          throw new KakaoAssistantError("INVALID_INPUT");
        }
        const identity = normalizedIdentity(command.name);
        const activeApplications = await transaction.select({ application: seasonApplications, player: players })
          .from(seasonApplications).innerJoin(players, eq(players.id, seasonApplications.playerId)).where(and(
            eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.applyDate, command.applyDate),
            eq(seasonApplications.recruitNo, command.recruitNo),
            inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
            or(
              eq(seasonApplications.source, "SITE"),
              and(
                eq(seasonApplications.source, "KAKAO"),
                eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
                eq(seasonApplications.sourceMode, sourceMode),
              ),
            ),
          )).for("update");
        const scopedPending = await transaction.select().from(seasonKakaoPendingApplications).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )).for("update");
        const applicationMatches = activeApplications.filter(({ application, player }) =>
          (command.action === "ADD_PARTICIPANT" || (
            application.source === "KAKAO" && (application.status === "APPLIED" || application.status === "RESERVE")
          )) && (player.memberNameNormalized === identity || player.nicknameNormalized === identity));
        const pendingMatches = scopedPending.filter((pending) => normalizedIdentity(pending.suppliedName) === identity);
        if (command.action === "REMOVE_PARTICIPANT") {
          if (applicationMatches.length + pendingMatches.length > 1) throw new KakaoAssistantError("CONFLICT");
          if (applicationMatches[0]) {
            await transaction.update(seasonApplications).set({
              status: "CANCELLED", cancelledAt: now, revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
            }).where(eq(seasonApplications.id, applicationMatches[0].application.id));
            cancelledCount += 1;
          } else if (pendingMatches[0]) {
            await transaction.update(seasonKakaoPendingApplications).set({
              status: "CANCELLED", cancelledAt: now, revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
            }).where(eq(seasonKakaoPendingApplications.id, pendingMatches[0].id));
            cancelledCount += 1;
          }
        } else if (positionsSpecified && applicationMatches.length + pendingMatches.length > 0) {
          if (applicationMatches.length + pendingMatches.length > 1) throw new KakaoAssistantError("CONFLICT");
          const mainPosition = command.mainPosition!;
          const subPositions = [...(command.subPositions ?? [])];
          const sourceReferenceHash = Buffer.from(input.intent.bodyDigestHex, "hex");
          const applicationMatch = applicationMatches[0];
          if (applicationMatch && applicationMatch.application.source === "KAKAO" &&
              (applicationMatch.application.status === "APPLIED" || applicationMatch.application.status === "RESERVE")) {
            const previousSubPositions = applicationMatch.application.subPositions;
            const changed = applicationMatch.application.mainPosition !== mainPosition ||
              previousSubPositions.length !== subPositions.length ||
              previousSubPositions.some((position, index) => position !== subPositions[index]);
            if (changed) {
              await transaction.update(seasonApplications).set({
                mainPosition, subPositions, sourceReferenceHash,
                revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
              }).where(eq(seasonApplications.id, applicationMatch.application.id));
              updatedCount += 1;
            }
          } else if (pendingMatches[0]) {
            const previousSubPositions = pendingMatches[0].subPositions;
            const changed = pendingMatches[0].mainPosition !== mainPosition ||
              previousSubPositions.length !== subPositions.length ||
              previousSubPositions.some((position, index) => position !== subPositions[index]);
            if (changed) {
              await transaction.update(seasonKakaoPendingApplications).set({
                mainPosition, subPositions, sourceReferenceHash,
                revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
              }).where(eq(seasonKakaoPendingApplications.id, pendingMatches[0].id));
              updatedCount += 1;
            }
          }
        } else if (applicationMatches.length + pendingMatches.length === 0) {
          const metadata = (await transaction.select().from(seasonInhouseRounds).where(and(
            eq(seasonInhouseRounds.seasonId, command.seasonId), eq(seasonInhouseRounds.applyDate, command.applyDate),
            eq(seasonInhouseRounds.recruitNo, command.recruitNo), eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
            eq(seasonInhouseRounds.status, "IN_PROGRESS"),
          )).for("update").limit(1))[0]!;
          const reserve = command.reserve ?? false;
          const mainCount = activeApplications.filter(({ application }) => application.status !== "RESERVE").length +
            scopedPending.filter((pending) => !pending.reserve).length;
          const reserveCount = activeApplications.filter(({ application }) => application.status === "RESERVE").length +
            scopedPending.filter((pending) => pending.reserve).length;
          if ((!reserve && mainCount >= metadata.capacity) || (reserve && reserveCount >= metadata.capacity)) {
            throw new KakaoAssistantError("CONFLICT");
          }
          const usedSlots = new Set([
            ...activeApplications.map(({ application }) => application.sourceSlotNo).filter((slot): slot is number => slot !== null),
            ...scopedPending.map((pending) => pending.slotNo),
          ]);
          let slotNo = reserve ? metadata.capacity + 1 : 1;
          while (usedSlots.has(slotNo)) slotNo += 1;
          if (slotNo > metadata.capacity * (reserve ? 2 : 1)) throw new KakaoAssistantError("CONFLICT");
          const candidates = await transaction.select().from(players).where(and(
            eq(players.status, "ACTIVE"), or(eq(players.memberNameNormalized, identity), eq(players.nicknameNormalized, identity)),
          )).orderBy(asc(players.id)).limit(3);
          const mainPosition = command.mainPosition ?? "ALL";
          const subPositions = command.subPositions ?? [];
          const sourceReferenceHash = Buffer.from(input.intent.bodyDigestHex, "hex");
          if (candidates.length === 1 && !reserve) {
            const current = (await transaction.select().from(seasonApplications).where(and(
              eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.playerId, candidates[0]!.id),
              eq(seasonApplications.applyDate, command.applyDate), eq(seasonApplications.recruitNo, command.recruitNo),
            )).for("update").limit(1))[0];
            const ownedByThisRoom = current?.source !== "KAKAO" || (
              current.sourceRoomIdHash !== null && sameBytes(current.sourceRoomIdHash, sourceRoomIdHash) &&
              current.sourceMode === sourceMode
            );
            const mergePlan = ownedByThisRoom
              ? planSeasonApplicationMerge(current ?? null)
              : { action: "PRESERVE" as const, outcome: "REVIEWED_PRESERVED" as const };
            const values = {
              sourceSlotNo: slotNo, mainPosition, subPositions: [...subPositions], status: "APPLIED" as const,
              source: "KAKAO" as const, sourceReferenceHash, sourceRoomIdHash, sourceMode,
              reviewNote: null, reviewedByUserAccountId: null, reviewedAt: null, cancelledAt: null,
              updatedAt: now,
            };
            if (mergePlan.action === "REFRESH_KAKAO") {
              await transaction.update(seasonApplications).set({ ...values, revision: sql`${seasonApplications.revision} + 1` }).where(eq(seasonApplications.id, current!.id));
              updatedCount += 1;
            } else if (mergePlan.action === "CREATE_KAKAO") {
              await transaction.insert(seasonApplications).values({ id: randomUUID(), seasonId: command.seasonId, playerId: candidates[0]!.id, applyDate: command.applyDate, recruitNo: command.recruitNo, createdAt: now, ...values });
              createdCount += 1;
            }
          } else {
            const historical = (await transaction.select().from(seasonKakaoPendingApplications).where(and(
              eq(seasonKakaoPendingApplications.seasonId, command.seasonId), eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
              eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo), eq(seasonKakaoPendingApplications.slotNo, slotNo),
              eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash), eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
            )).for("update").limit(1))[0];
            const matchState = candidates.length === 1 && reserve ? "MATCHED_RESERVE" as const : candidates.length > 1 ? "AMBIGUOUS" as const : "UNMATCHED" as const;
            const values = {
              matchedPlayerId: matchState === "MATCHED_RESERVE" ? candidates[0]!.id : null,
              suppliedName: command.name, suppliedRiotId: null, mainPosition, subPositions: [...subPositions], reserve,
              matchState, status: "ACTIVE" as const, sourceReferenceHash, sourceRoomIdHash, sourceMode,
              cancelledAt: null, resolvedAt: null, updatedAt: now,
            };
            if (historical) await transaction.update(seasonKakaoPendingApplications).set({ ...values, revision: sql`${seasonKakaoPendingApplications.revision} + 1` }).where(eq(seasonKakaoPendingApplications.id, historical.id));
            else await transaction.insert(seasonKakaoPendingApplications).values({ id: randomUUID(), seasonId: command.seasonId, applyDate: command.applyDate, recruitNo: command.recruitNo, slotNo, createdAt: now, ...values });
            createdCount += 1;
          }
        }
      }
      if (command.action === "SYNC") {
        const sourceHash = Buffer.from(input.intent.bodyDigestHex, "hex");
        let requestedMetadata = command.roundMetadata;
        let guardedParticipants: readonly KakaoSeasonSnapshotParticipant[] | null = null;
        let guardedPreserveSlots: readonly number[] | null = null;
        const beforeCopyState = command.copyGuard ? await inhouseCopyState(transaction, {
          seasonId: command.seasonId, applyDate: command.applyDate, recruitNo: command.recruitNo, sourceRoomIdHash,
        }) : null;
        if (command.copyGuard && beforeCopyState) {
          const { operatingDate, saveReference, formCode } = command.copyGuard;
          if ((operatingDate !== null && operatingDate !== recruitingOperatingDateKey(now)) ||
              (saveReference !== null && saveReference !== beforeCopyState.saveReference)) {
            throw new KakaoAssistantError("PRECONDITION_FAILED");
          }
          const currentRound = beforeCopyState.round;
          const stored = formCode ? await loadKakaoFormSnapshot(transaction, {
            kind: "INHOUSE", scopeHash: sourceRoomIdHash, targetId: beforeCopyState.snapshot.roundId,
            operatingDate: recruitingOperatingDateKey(now), code: formCode, now,
          }) : beforeCopyState.snapshot;
          if (!stored || stored.roundId !== beforeCopyState.snapshot.roundId || stored.mode !== command.mode ||
              stored.mode !== beforeCopyState.snapshot.mode || !Array.isArray(stored.rows)) {
            throw new KakaoAssistantError("PRECONDITION_FAILED");
          }
          const originalRows = stored.rows as unknown as readonly InhouseCopyRow[];
          const normalizeMetadata = (value: unknown) => typeof value === "string" && value !== "미입력" ? value.trim() || null : null;
          if (requestedMetadata && currentRound) {
            if (requestedMetadata.capacity !== stored.capacity || currentRound.capacity !== stored.capacity) {
              throw new KakaoAssistantError("PRECONDITION_FAILED");
            }
            // Only a stored copy identifies the original values well enough to
            // distinguish an intentional edit from a stale form overwriting a
            // newer site/admin edit. Legacy reference-only copies remain read-only.
            const mergeText = (original: unknown, current: string | null, submitted: string | null) => {
              const base = normalizeMetadata(original);
              const latest = normalizeMetadata(current);
              const next = normalizeMetadata(submitted);
              if (next === base || next === latest) return current;
              if (formCode && base === latest) return submitted;
              throw new KakaoAssistantError("PRECONDITION_FAILED");
            };
            const startTimeText = mergeText(stored.startTimeText, currentRound.startTimeText, requestedMetadata.startTimeText);
            requestedMetadata = {
              capacity: currentRound.capacity,
              startTimeText,
              scheduledStartAt: startTimeText === currentRound.startTimeText
                ? currentRound.scheduledStartAt?.toISOString() ?? null : requestedMetadata.scheduledStartAt,
              gameInfo: mergeText(stored.gameInfo, currentRound.gameInfo, requestedMetadata.gameInfo ?? null),
              organizerText: requestedMetadata.organizerText == null ? currentRound.organizerText
                : mergeText(stored.organizerText, currentRound.organizerText, requestedMetadata.organizerText),
              noticeText: mergeText(stored.noticeText, currentRound.noticeText ? oneLineInhouseNotice(currentRound.noticeText) : null, requestedMetadata.noticeText),
            };
          }
          const copyPlan = planInhouseCopyAdditions({ original: originalRows, current: beforeCopyState.rows, submitted: command.participants });
          if (!copyPlan) throw new KakaoAssistantError("PRECONDITION_FAILED");
          guardedParticipants = [...copyPlan.additions, ...copyPlan.pendingEdits.map((edit) => edit.submitted)];
          const editedSlots = new Set(copyPlan.pendingEdits.map((edit) => edit.current.slotNo));
          guardedPreserveSlots = beforeCopyState.rows.filter((row) => !editedSlots.has(row.slotNo)).map((row) => row.slotNo);
        }
        const scopedMetadata = await transaction.select().from(seasonInhouseRounds).where(and(
          eq(seasonInhouseRounds.seasonId, command.seasonId),
          eq(seasonInhouseRounds.applyDate, command.applyDate),
          eq(seasonInhouseRounds.recruitNo, command.recruitNo),
          eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
        )).for("update");
        const currentMetadata = scopedMetadata.find((metadata) => metadata.mode === command.mode);
        if (scopedMetadata.some((metadata) => metadata.status !== "DRAFT" && metadata.status !== "IN_PROGRESS")) {
          throw new KakaoAssistantError("INVALID_STATE");
        }
        const previousModes = INHOUSE_MODES.filter((mode) => mode !== command.mode);
        const previousModeApplications = await transaction.select({ application: seasonApplications, player: players })
          .from(seasonApplications)
          .innerJoin(players, eq(players.id, seasonApplications.playerId))
          .where(and(
            eq(seasonApplications.seasonId, command.seasonId),
            eq(seasonApplications.applyDate, command.applyDate),
            eq(seasonApplications.recruitNo, command.recruitNo),
            eq(seasonApplications.source, "KAKAO"),
            eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
            inArray(seasonApplications.sourceMode, previousModes),
            inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
          )).for("update");
        if (previousModeApplications.some(({ application }) => application.status === "CONFIRMED")) {
          throw new KakaoAssistantError("INVALID_STATE");
        }
        const obsoleteMetadataIds = scopedMetadata
          .filter((metadata) => metadata.mode !== command.mode)
          .map((metadata) => metadata.id);
        if (obsoleteMetadataIds.length > 0) {
          await transaction.delete(seasonInhouseRounds).where(inArray(seasonInhouseRounds.id, obsoleteMetadataIds));
        }
        const cancellablePreviousModeApplications = previousModeApplications.filter(({ application }) =>
          application.status === "APPLIED" || application.status === "RESERVE");
        if (cancellablePreviousModeApplications.length > 0) {
          await transaction.update(seasonApplications).set({
            status: "CANCELLED",
            cancelledAt: now,
            reviewNote: null,
            reviewedByUserAccountId: null,
            reviewedAt: null,
            revision: sql`${seasonApplications.revision} + 1`,
            updatedAt: now,
          }).where(inArray(seasonApplications.id, cancellablePreviousModeApplications.map(({ application }) => application.id)));
          cancelledCount += cancellablePreviousModeApplications.length;
          legacyChanges.removed.push(...cancellablePreviousModeApplications.map(({ application, player }) =>
            application.sourceSlotNo ? `${application.sourceSlotNo}. ${player.memberName}` : player.memberName));
        }
        const previousModePending = await transaction.select().from(seasonKakaoPendingApplications).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          inArray(seasonKakaoPendingApplications.sourceMode, previousModes),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )).for("update");
        if (previousModePending.length > 0) {
          await transaction.update(seasonKakaoPendingApplications).set({
            status: "CANCELLED",
            cancelledAt: now,
            revision: sql`${seasonKakaoPendingApplications.revision} + 1`,
            updatedAt: now,
          }).where(inArray(seasonKakaoPendingApplications.id, previousModePending.map((pending) => pending.id)));
          cancelledCount += previousModePending.length;
          legacyChanges.removed.push(...previousModePending.map((pending) =>
            `${pending.reserve ? `예비 ${pending.slotNo}` : pending.slotNo}. ${pending.suppliedName}`));
        }
        const activatingDraft = currentMetadata?.status === "DRAFT";
        const requestedOrganizer = requestedMetadata?.organizerText?.trim() ||
          (activatingDraft ? command.participants.find((participant) => !participant.reserve)?.name : null) || null;
        let snapshotParticipants: readonly KakaoSeasonSnapshotParticipant[] = guardedParticipants ?? command.participants;
        if (activatingDraft && snapshotParticipants.length === 0) {
          if (!requestedOrganizer) throw new KakaoAssistantError("INVALID_INPUT");
          snapshotParticipants = Object.freeze([Object.freeze({
            slotNo: 1,
            name: requestedOrganizer,
            riotId: null,
            mainPosition: "ALL" as const,
            subPositions: Object.freeze([]),
            reserve: false,
          })]);
        }
        if (requestedMetadata) {
        const scheduledStartAt = requestedMetadata.scheduledStartAt === null
          ? null
          : new Date(requestedMetadata.scheduledStartAt);
        const startTimeText = requestedMetadata.startTimeText ?? (command.copyGuard ? null : activatingDraft ? kakaoRecruitTimeText(now) : currentMetadata?.startTimeText ?? null);
        const gameInfo = requestedMetadata.gameInfo?.trim() || (activatingDraft ? "미입력" : currentMetadata?.gameInfo ?? null);
        const organizerText = requestedOrganizer || currentMetadata?.organizerText || null;
        metadataUpdated = !currentMetadata ||
          currentMetadata.status !== "IN_PROGRESS" ||
          currentMetadata.capacity !== requestedMetadata.capacity ||
          currentMetadata.startTimeText !== startTimeText ||
          currentMetadata.scheduledStartAt?.getTime() !== scheduledStartAt?.getTime() ||
          currentMetadata.gameInfo !== gameInfo ||
          currentMetadata.organizerText !== organizerText ||
          currentMetadata.noticeText !== requestedMetadata.noticeText;
        if (!currentMetadata) {
          await transaction.insert(seasonInhouseRounds).values({
            id: randomUUID(),
            seasonId: command.seasonId,
            applyDate: command.applyDate,
            recruitNo: command.recruitNo,
            sourceRoomIdHash,
            mode: command.mode,
            status: "IN_PROGRESS",
            capacity: requestedMetadata.capacity,
            startTimeText,
            scheduledStartAt,
            gameInfo,
            organizerText,
            noticeText: requestedMetadata.noticeText,
            sourceReferenceHash: sourceHash,
            createdAt: now,
            updatedAt: now,
          });
        } else if (metadataUpdated) {
          await transaction.update(seasonInhouseRounds).set({
            capacity: requestedMetadata.capacity,
            status: "IN_PROGRESS",
            startTimeText,
            scheduledStartAt,
            gameInfo,
            organizerText,
            noticeText: requestedMetadata.noticeText,
            sourceReferenceHash: sourceHash,
            revision: sql`${seasonInhouseRounds.revision} + 1`,
            updatedAt: now,
          }).where(eq(seasonInhouseRounds.id, currentMetadata.id));
        }
        legacyChanges.metadataChanged = metadataUpdated;
        }
        const preserveSlotNos = new Set(guardedPreserveSlots ?? command.preserveSlotNos ?? []);
        if (!guardedParticipants && snapshotParticipants !== command.participants) preserveSlotNos.delete(1);
        const siteApplications = await transaction.select().from(seasonApplications).where(and(
          eq(seasonApplications.seasonId, command.seasonId),
          eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo),
          eq(seasonApplications.source, "SITE"),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
        )).for("update");
        let matched: Array<{
          participant: KakaoSeasonSnapshotParticipant;
          candidates: (typeof players.$inferSelect)[];
        }> = [];
        const resolvedPlayerIds = new Set<string>();
        for (const participant of snapshotParticipants) {
          const riot = splitRiotId(participant.riotId);
          const identity = normalizedIdentity(participant.name);
          let candidates = participant.reviewRequired
            ? []
            : await transaction.select().from(players).where(and(
                eq(players.status, "ACTIVE"),
                riot
                  ? and(eq(players.nicknameNormalized, riot.nickname), eq(players.tagLineNormalized, riot.tagLine))
                  : or(eq(players.memberNameNormalized, identity), eq(players.nicknameNormalized, identity)),
              )).orderBy(asc(players.id)).limit(3);
          if (guardedParticipants && candidates.length === 1 && (
            beforeCopyState?.applications.some(({ application }) => application.playerId === candidates[0]!.id) ||
            beforeCopyState?.pending.some((row) => row.matchedPlayerId === candidates[0]!.id)
          )) throw new KakaoAssistantError("PRECONDITION_FAILED");
          const resolvedPlayerId = candidates.length === 1 && !participant.reserve ? candidates[0]!.id : null;
          if (resolvedPlayerId && resolvedPlayerIds.has(resolvedPlayerId)) {
            // Different aliases can resolve to the same player. Keep the first
            // authoritative slot and send later duplicates to the existing
            // manual-review queue instead of aborting the entire snapshot.
            candidates = [];
          } else if (resolvedPlayerId) {
            resolvedPlayerIds.add(resolvedPlayerId);
          }
          matched.push({ participant, candidates });
        }
        const uniqueMatchedIds = matched
          .filter((item) => item.candidates.length === 1 && !item.participant.reserve)
          .map((item) => item.candidates[0]!.id);
        if (new Set(uniqueMatchedIds).size !== uniqueMatchedIds.length) throw new KakaoAssistantError("CONFLICT");

        // SITE rows are part of the same visible roster but are never rewritten
        // by a Kakao snapshot. Move only Kakao-owned incoming rows to the next
        // free integrated slot so persisted slots do not collide with SITE.
        const capacity = requestedMetadata?.capacity ?? currentMetadata?.capacity ?? LEGACY_INHOUSE_CAPACITY;
        const sitePlayerIds = new Set(siteApplications.map((application) => application.playerId));
        const occupiedSlots = new Set([
          ...siteApplications.map((application) => application.sourceSlotNo)
            .filter((slot): slot is number => slot !== null && slot >= 1 && slot <= capacity),
          ...preserveSlotNos,
        ]);
        matched = matched.map((item) => {
          const representedBySite = item.candidates.length === 1 && !item.participant.reserve && sitePlayerIds.has(item.candidates[0]!.id);
          if (representedBySite) return item;
          let slotNo = item.participant.slotNo;
          if (occupiedSlots.has(slotNo)) {
            slotNo = item.participant.reserve ? capacity + 1 : 1;
            while (occupiedSlots.has(slotNo)) slotNo += 1;
          }
          if (slotNo > capacity * (item.participant.reserve ? 2 : 1)) throw new KakaoAssistantError("CONFLICT");
          occupiedSlots.add(slotNo);
          return slotNo === item.participant.slotNo ? item : { ...item, participant: { ...item.participant, slotNo } };
        });

        const currentApplications = await transaction.select().from(seasonApplications).where(and(
          eq(seasonApplications.seasonId, command.seasonId),
          eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo),
          eq(seasonApplications.source, "KAKAO"),
          eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonApplications.sourceMode, sourceMode),
        )).for("update");
        const currentPlayerIds = [...new Set(currentApplications.map((application) => application.playerId))];
        const currentPlayerRecords = new Map(currentPlayerIds.length === 0 ? [] : (await transaction.select({
          id: players.id,
          memberName: players.memberName,
          memberNameNormalized: players.memberNameNormalized,
          nicknameNormalized: players.nicknameNormalized,
        }).from(players).where(inArray(players.id, currentPlayerIds))).map((player) => [player.id, player] as const));
        for (const { participant } of matched) {
          if (!participant.reviewRequired) continue;
          const current = currentApplications.find((application) =>
            application.sourceSlotNo === participant.slotNo && application.status !== "CANCELLED");
          const player = current ? currentPlayerRecords.get(current.playerId) : null;
          const suppliedIdentity = normalizedIdentity(participant.name);
          if (
            player &&
            (suppliedIdentity === player.memberNameNormalized || suppliedIdentity === player.nicknameNormalized)
          ) {
            // A partial annotation for the same person is weaker than the
            // already accepted slot. Preserve the application instead of
            // cancelling it and creating a pending-review downgrade.
            preserveSlotNos.add(participant.slotNo);
          }
        }
        for (const current of currentApplications) {
          if (guardedParticipants !== null) continue;
          if (
            uniqueMatchedIds.includes(current.playerId) || current.status === "CANCELLED" ||
            (current.sourceSlotNo !== null && preserveSlotNos.has(current.sourceSlotNo))
          ) continue;
          if (current.status !== "APPLIED") continue;
          await transaction.update(seasonApplications).set({
            status: "CANCELLED", cancelledAt: now, revision: sql`${seasonApplications.revision} + 1`, updatedAt: now,
          }).where(eq(seasonApplications.id, current.id));
          cancelledCount += 1;
          const playerName = currentPlayerRecords.get(current.playerId)?.memberName ?? "이름 미확인";
          legacyChanges.removed.push(current.sourceSlotNo ? `${current.sourceSlotNo}. ${playerName}` : playerName);
        }

        const activeSlots = new Set([...matched.map(({ participant }) => participant.slotNo), ...preserveSlotNos]);
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
          if (guardedParticipants !== null) continue;
          if (pending.reserve && !command.reserveSectionObserved) continue;
          if (pending.status !== "ACTIVE" || activeSlots.has(pending.slotNo)) continue;
          await transaction.update(seasonKakaoPendingApplications).set({
            status: "CANCELLED", cancelledAt: now, revision: sql`${seasonKakaoPendingApplications.revision} + 1`, updatedAt: now,
          }).where(eq(seasonKakaoPendingApplications.id, pending.id));
          cancelledCount += 1;
          legacyChanges.removed.push(`${pending.reserve ? `예비 ${pending.slotNo}` : pending.slotNo}. ${pending.suppliedName}`);
        }

        for (const item of matched) {
          let participant = item.participant;
          const candidates = item.candidates;
          const savedPending = participant.nameOnly ? currentPending.find((pending) =>
            pending.status === "ACTIVE" && pending.slotNo === participant.slotNo &&
            normalizedIdentity(pending.suppliedName) === normalizedIdentity(participant.name)) : null;
          if (savedPending) participant = { ...participant, mainPosition: savedPending.mainPosition, subPositions: savedPending.subPositions };
          if (participant.reviewRequired && preserveSlotNos.has(participant.slotNo)) continue;
          const matchedPlayer = candidates.length === 1 ? candidates[0]! : null;
          if (matchedPlayer && !participant.reserve) {
            const current = (await transaction.select().from(seasonApplications).where(and(
              eq(seasonApplications.seasonId, command.seasonId),
              eq(seasonApplications.playerId, matchedPlayer.id),
              eq(seasonApplications.applyDate, command.applyDate),
              eq(seasonApplications.recruitNo, command.recruitNo),
            )).for("update").limit(1))[0];
            if (participant.nameOnly && current && current.status !== "CANCELLED") {
              // Names-only copies keep previously chosen lanes.
              participant = { ...participant, mainPosition: current.mainPosition, subPositions: current.subPositions };
            }
            const currentOwnedBySnapshot = current?.source !== "KAKAO" || (
              current.sourceRoomIdHash !== null && sameBytes(current.sourceRoomIdHash, sourceRoomIdHash) &&
              INHOUSE_MODES.includes(current.sourceMode as typeof INHOUSE_MODES[number])
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
                legacyChanges.updated.push(legacySeasonParticipantLabel(participant, matchedPlayer.memberName, capacity));
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
              legacyChanges.added.push(legacySeasonParticipantLabel(participant, matchedPlayer.memberName, capacity));
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
              (participant.reserve ? legacyChanges.reserve : legacyChanges.pending)
                .push(legacySeasonParticipantLabel(participant, matchedPlayer?.memberName, capacity));
            }
          } else {
            await transaction.insert(seasonKakaoPendingApplications).values({
              id: randomUUID(), seasonId: command.seasonId, applyDate: command.applyDate,
              recruitNo: command.recruitNo, slotNo: participant.slotNo, createdAt: now,
              ...pendingValues,
            });
            createdCount += 1;
            (participant.reserve ? legacyChanges.reserve : legacyChanges.pending)
              .push(legacySeasonParticipantLabel(participant, matchedPlayer?.memberName, capacity));
          }
        }
        const integratedApplications = await transaction.select({ id: seasonApplications.id, status: seasonApplications.status }).from(seasonApplications).where(and(
          eq(seasonApplications.seasonId, command.seasonId),
          eq(seasonApplications.applyDate, command.applyDate),
          eq(seasonApplications.recruitNo, command.recruitNo),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
          or(
            eq(seasonApplications.source, "SITE"),
            and(
              eq(seasonApplications.source, "KAKAO"),
              eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
              eq(seasonApplications.sourceMode, sourceMode),
            ),
          ),
        ));
        const integratedPending = await transaction.select({ id: seasonKakaoPendingApplications.id, reserve: seasonKakaoPendingApplications.reserve }).from(seasonKakaoPendingApplications).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          eq(seasonKakaoPendingApplications.recruitNo, command.recruitNo),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        ));
        const integratedMainCount = integratedApplications.filter((application) => application.status !== "RESERVE").length +
          integratedPending.filter((item) => !item.reserve).length;
        const integratedReserveCount = integratedApplications.filter((application) => application.status === "RESERVE").length +
          integratedPending.filter((item) => item.reserve).length;
        if (integratedMainCount > capacity || integratedReserveCount > capacity) throw new KakaoAssistantError("CONFLICT");
        await transaction.insert(auditEvents).values({
          requestId: input.requestId,
          action: "KAKAO_SEASON_SNAPSHOT_SYNCED",
          targetType: "SEASON_RECRUIT_ROUND",
          targetId: roundKey,
          metadataJson: {
            participantCount: snapshotParticipants.length,
            reviewRequiredCount: snapshotParticipants.filter((participant) => participant.reviewRequired).length,
            preservedSlotCount: preserveSlotNos.size,
            createdCount,
            updatedCount,
            cancelledCount,
            metadataUpdated,
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

      const allRoundProjection = command.action === "STATUS" || command.action === "FINISH";
      const projectedRecruitNo = command.action === "FINISH" ? null : command.recruitNo;
      const applicationCandidates = await transaction.select({ application: seasonApplications, player: players }).from(seasonApplications)
        .innerJoin(players, eq(players.id, seasonApplications.playerId)).where(and(
          eq(seasonApplications.seasonId, command.seasonId), eq(seasonApplications.applyDate, command.applyDate),
          projectedRecruitNo === null ? undefined : eq(seasonApplications.recruitNo, projectedRecruitNo),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
          or(
            eq(seasonApplications.source, "SITE"),
            and(
              eq(seasonApplications.source, "KAKAO"),
              eq(seasonApplications.sourceRoomIdHash, sourceRoomIdHash),
              allRoundProjection
                ? inArray(seasonApplications.sourceMode, INHOUSE_MODES)
                : eq(seasonApplications.sourceMode, sourceMode),
            ),
          ),
        )).orderBy(asc(seasonApplications.recruitNo), asc(seasonApplications.sourceSlotNo), asc(seasonApplications.createdAt), asc(seasonApplications.id));
      const pendingCandidates = await transaction.select({ pending: seasonKakaoPendingApplications, player: players }).from(seasonKakaoPendingApplications)
        .leftJoin(players, eq(players.id, seasonKakaoPendingApplications.matchedPlayerId)).where(and(
          eq(seasonKakaoPendingApplications.seasonId, command.seasonId),
          eq(seasonKakaoPendingApplications.applyDate, command.applyDate),
          projectedRecruitNo === null ? undefined : eq(seasonKakaoPendingApplications.recruitNo, projectedRecruitNo),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
          eq(seasonKakaoPendingApplications.sourceRoomIdHash, sourceRoomIdHash),
          allRoundProjection
            ? inArray(seasonKakaoPendingApplications.sourceMode, INHOUSE_MODES)
            : eq(seasonKakaoPendingApplications.sourceMode, sourceMode),
        )).orderBy(asc(seasonKakaoPendingApplications.recruitNo), asc(seasonKakaoPendingApplications.slotNo), asc(seasonKakaoPendingApplications.createdAt), asc(seasonKakaoPendingApplications.id));
      const scopedMetadataRows = await transaction.select().from(seasonInhouseRounds).where(and(
        eq(seasonInhouseRounds.seasonId, command.seasonId),
        eq(seasonInhouseRounds.applyDate, command.applyDate),
        projectedRecruitNo === null ? undefined : eq(seasonInhouseRounds.recruitNo, projectedRecruitNo),
        eq(seasonInhouseRounds.sourceRoomIdHash, sourceRoomIdHash),
        allRoundProjection ? inArray(seasonInhouseRounds.mode, INHOUSE_MODES) : eq(seasonInhouseRounds.mode, sourceMode),
      )).orderBy(asc(seasonInhouseRounds.recruitNo), desc(seasonInhouseRounds.updatedAt), desc(seasonInhouseRounds.id));
      const metadataRows = scopedMetadataRows.filter((row) => row.status === "IN_PROGRESS");
      const roundMetadataList = metadataRows.map(toSeasonRoundMetadata);
      const metadataByRecruitNo = new Map<number, KakaoSeasonRoundMetadataDto>();
      for (const metadata of roundMetadataList) {
        if (!metadataByRecruitNo.has(metadata.recruitNo)) metadataByRecruitNo.set(metadata.recruitNo, metadata);
      }
      // A legacy detail command identifies only the round number. If old data
      // contains more than one mode for the same room/date/round, render the
      // most recently updated metadata and its Kakao roster instead of merging
      // incompatible modes. SITE applications remain shared and appear once.
      const selectedMode = (recruitNo: number) => metadataByRecruitNo.get(recruitNo)?.mode ?? "RIFT";
      const roundVisible = (recruitNo: number) => {
        const rows = scopedMetadataRows.filter((row) => row.recruitNo === recruitNo);
        return rows.length === 0 || rows.some((row) => row.status === "IN_PROGRESS");
      };
      const applications = applicationCandidates.filter(({ application }) =>
        roundVisible(application.recruitNo) && (application.source === "SITE" || application.sourceMode === selectedMode(application.recruitNo)));
      const pending = pendingCandidates.filter(({ pending: item }) =>
        roundVisible(item.recruitNo) && item.sourceMode === selectedMode(item.recruitNo));
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
          pending: item.matchState !== "MATCHED_RESERVE",
        })),
      ];
      const legacyGrouped = new Map<number, LegacySeasonEntry[]>();
      for (const entry of legacyEntries) {
        const group = legacyGrouped.get(entry.recruitNo) ?? [];
        group.push(entry);
        legacyGrouped.set(entry.recruitNo, group);
      }
      const visibleRecruitNos = [...new Set([...legacyGrouped.keys(), ...metadataByRecruitNo.keys()])];
      const copyStates = new Map<number, Readonly<{ operatingDate: string; saveReference: string; formCode?: string }>>();
      const detailNumbers = command.action !== "FINISH" && command.recruitNo !== null
        ? [command.recruitNo]
        : visibleRecruitNos.length === 1 ? visibleRecruitNos : [];
      for (const recruitNo of detailNumbers) {
        const state = await inhouseCopyState(transaction, { seasonId: command.seasonId, applyDate: command.applyDate, recruitNo, sourceRoomIdHash });
        for (let index = 0; index < legacyEntries.length; index += 1) {
          const entry = legacyEntries[index]!;
          if (entry.recruitNo !== recruitNo) continue;
          const row = state.rows.find((candidate) => normalizedIdentity(candidate.name) === normalizedIdentity(entry.name) && candidate.reserve === entry.reserve);
          if (row) legacyEntries[index] = { ...entry, slotNo: row.slotNo };
        }
        legacyGrouped.set(recruitNo, legacyEntries.filter((entry) => entry.recruitNo === recruitNo));
        const formCode = command.applyDate === recruitingOperatingDateKey(now) && (state.round || state.rows.length > 0) ? await issueKakaoFormSnapshot(transaction, {
          kind: "INHOUSE", scopeHash: sourceRoomIdHash, targetId: state.snapshot.roundId,
          operatingDate: recruitingOperatingDateKey(now), state: state.snapshot, now,
        }) : undefined;
        copyStates.set(recruitNo, { operatingDate: recruitingOperatingDateKey(now), saveReference: state.saveReference, formCode });
      }
      if (command.action === "SYNC") {
        legacyChanges.currentMainCount = legacyEntries.filter((entry) => !entry.reserve).length;
        legacyChanges.roundMetadata = metadataByRecruitNo.get(command.recruitNo) ?? null;
      }
      if (command.action === "STATUS" && command.recruitNo === null) {
        const availableRecruitNos = [...new Set([...legacyGrouped.keys(), ...metadataByRecruitNo.keys()])]
          .sort((left, right) => left - right);
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
          roundMetadataList: Object.freeze(roundMetadataList),
          legacyReply: legacyInhouseOverview(command.applyDate, legacyGrouped, metadataByRecruitNo),
          v1StrictLegacyReply: v1StrictLegacyInhouseStatus(command.applyDate, legacyGrouped, metadataByRecruitNo, copyStates),
        });
      }
      if (command.action === "FINISH") {
        const availableRecruitNos = [...new Set([...legacyGrouped.keys(), ...metadataByRecruitNo.keys()])]
          .sort((left, right) => left - right);
        return Object.freeze({
          kind: "SEASON_APPLICATION_SNAPSHOT" as const,
          seasonId: command.seasonId,
          applyDate: command.applyDate,
          recruitNo: command.recruitNo,
          entries: Object.freeze([]),
          appliedCount: applications.filter(({ application }) => application.status === "APPLIED").length,
          reserveCount: applications.filter(({ application }) => application.status === "RESERVE").length +
            pending.filter(({ pending: item }) => item.matchState === "MATCHED_RESERVE").length,
          confirmedCount: applications.filter(({ application }) => application.status === "CONFIRMED").length,
          pendingCount: pending.filter(({ pending: item }) => item.matchState !== "MATCHED_RESERVE").length,
          cancelledCount,
          metadataUpdated,
          availableRecruitNos: Object.freeze(availableRecruitNos),
          roundMetadataList: Object.freeze(roundMetadataList),
          legacyReply: legacyInhouseOverview(command.applyDate, legacyGrouped, metadataByRecruitNo),
          v1StrictLegacyReply: v1StrictLegacyInhouseStatus(command.applyDate, legacyGrouped, metadataByRecruitNo, copyStates),
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
          reserve: application.status === "RESERVE",
          player: { playerId: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}`, memberName: player.memberName },
        })),
        ...pending.map(({ pending: item, player }) => ({
          slotNo: item.slotNo,
          status: item.matchState,
          source: "KAKAO" as const,
          suppliedName: item.suppliedName,
          suppliedRiotId: item.suppliedRiotId,
          mainPosition: item.mainPosition,
          subPositions: item.subPositions,
          reserve: item.reserve,
          player: player ? { playerId: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}`, memberName: player.memberName } : null,
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
        metadataUpdated,
        roundMetadata: command.recruitNo === null ? null : metadataByRecruitNo.get(command.recruitNo) ?? null,
        ...(command.recruitNo === null ? {} : copyStates.get(command.recruitNo)),
        ...(command.action === "ADD_PARTICIPANT" || command.action === "REMOVE_PARTICIPANT" ? {
          legacyReply: legacyInhouseDetail(command.applyDate, command.recruitNo, legacyEntries, metadataByRecruitNo.get(command.recruitNo), copyStates.get(command.recruitNo)),
        } : {}),
        ...(command.action === "STATUS" ? {} : { createdCount, updatedCount, mode: sourceMode }),
        ...(command.action === "SYNC" ? { v1StrictLegacyReply: [
          legacySeasonSyncReply(command.recruitNo, legacyChanges),
          "",
          legacyInhouseDetail(command.applyDate, command.recruitNo, legacyEntries, metadataByRecruitNo.get(command.recruitNo), copyStates.get(command.recruitNo)),
        ].join("\n") } : {}),
        ...(command.action === "STATUS" && command.recruitNo !== null ? {
          legacyReply: legacyInhouseDetail(command.applyDate, command.recruitNo, legacyEntries, metadataByRecruitNo.get(command.recruitNo), copyStates.get(command.recruitNo)),
          v1StrictLegacyReply: legacyEntries.length > 0 || metadataByRecruitNo.has(command.recruitNo)
            ? legacyInhouseDetail(command.applyDate, command.recruitNo, legacyEntries, metadataByRecruitNo.get(command.recruitNo), copyStates.get(command.recruitNo))
            : "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.",
        } : {}),
      });
    });
  }
}
