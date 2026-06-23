import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { getKstStartOfDate } from "@/lib/date/kst";
import { writeAdminLog } from "@/lib/admin-log";
import { prisma } from "@/lib/prisma/client";
import {
  parseRecruitMessage,
  type ParsedRecruitMessage,
  type ParsedRecruitParticipant,
} from "@/lib/kakao/recruit-message-parser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_VERSION = "season-apply-format-v5";
const SEASON_RECRUIT_TARGET_COUNT = 10;

type ApplyResult = {
  participant: ParsedRecruitParticipant;
  status: "REGISTERED" | "UPDATED" | "UNCHANGED" | "PENDING" | "RESERVE";
  reason?: string;
  player?: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
  };
};

function simplifyPendingReason(reason?: string): string {
  const reasonText = String(reason || "").trim();

  if (reasonText.indexOf("2명 이상") >= 0 || reasonText.indexOf("동명이인") >= 0) {
    return "같은 이름/닉네임 후보가 2명 이상 있음";
  }

  if (reasonText.indexOf("매칭되지") >= 0 || reasonText.indexOf("찾을 수") >= 0) {
    return "등록된 플레이어를 찾을 수 없음";
  }

  if (reasonText.indexOf("예비") >= 0) {
    return "예비 참가자 확인 필요";
  }

  if (reasonText === "") {
    return "관리자 확인 필요";
  }

  return reasonText
    .replace(/\s*관리자 확인 필요\.?/g, "")
    .replace(/입니다\.?/g, "")
    .trim();
}

function buildPendingSummary(results: ApplyResult[]): string {
  const pendingResults = results.filter((item) => item.status === "PENDING");

  if (pendingResults.length === 0) {
    return "";
  }

  return pendingResults
    .map((result, index) => {
      const name = normalizeName(result.participant.name) || `${result.participant.slotNumber || index + 1}번 항목`;
      const reason = simplifyPendingReason(result.reason);

      if (pendingResults.length === 1) {
        return `대상: ${name}\n사유: ${reason}`;
      }

      return `${index + 1}. ${name} - ${reason}`;
    })
    .join("\n");
}

type ApplyChangeSummary = {
  added: string[];
  updated: string[];
  removed: string[];
  pending: string[];
  reserve: string[];
  currentMainCount: number;
  currentReserveCount: number;
};

type PreviousSeasonApplyEntry = {
  key: string;
  label: string;
  name: string;
  isReserve: boolean;
  slotNo: number | null;
  reserveSlotNo: number | null;
  mainPosition: unknown;
  subPositions: unknown;
  currentTier?: string | null;
  peakTier?: string | null;
  applyTimeText: string | null;
};

function createEmptyChangeSummary(params?: {
  currentMainCount?: number;
  currentReserveCount?: number;
}): ApplyChangeSummary {
  return {
    added: [],
    updated: [],
    removed: [],
    pending: [],
    reserve: [],
    currentMainCount: params?.currentMainCount ?? 0,
    currentReserveCount: params?.currentReserveCount ?? 0,
  };
}

function hasApplyChanges(changes: ApplyChangeSummary) {
  return (
    changes.added.length > 0 ||
    changes.updated.length > 0 ||
    changes.removed.length > 0 ||
    changes.pending.length > 0 ||
    changes.reserve.length > 0
  );
}

function compactChangeList(items: string[], maxItems = 6) {
  const normalizedItems = items
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalizedItems.length === 0) return "";
  if (normalizedItems.length <= maxItems) return normalizedItems.join(", ");

  return `${normalizedItems.slice(0, maxItems).join(", ")} 외 ${normalizedItems.length - maxItems}명`;
}

function pushChangeLine(lines: string[], label: string, items: string[]) {
  const text = compactChangeList(items);
  if (!text) return;
  lines.push(`${label}: ${text}`);
}

function buildReply(params: {
  parsed: ParsedRecruitMessage;
  seasonName: string;
  results: ApplyResult[];
  cancelledCount: number;
  changes: ApplyChangeSummary;
}) {
  const { changes } = params;
  const lines: string[] = [];
  const pendingResults = params.results.filter((item) => item.status === "PENDING");

  if (!hasApplyChanges(changes)) {
    return [
      "[K-LOL.GG 내전 명단 변경 없음]",
      `현재: ${changes.currentMainCount}/${SEASON_RECRUIT_TARGET_COUNT}`,
    ].join("\n");
  }

  lines.push(
    pendingResults.length > 0
      ? "[K-LOL.GG 내전 명단 업데이트/보류]"
      : "[K-LOL.GG 내전 명단 업데이트]",
  );

  pushChangeLine(lines, "추가", changes.added);
  pushChangeLine(lines, "수정", changes.updated);
  pushChangeLine(lines, "제외", changes.removed);
  pushChangeLine(lines, "보류", changes.pending);
  pushChangeLine(lines, "예비", changes.reserve);

  lines.push(`현재: ${changes.currentMainCount}/${SEASON_RECRUIT_TARGET_COUNT}`);

  if (pendingResults.length > 0 && changes.pending.length > 0) {
    const pendingSummary = buildPendingSummary(params.results);
    if (pendingSummary) {
      lines.push("", pendingSummary);
    }
  }

  return lines.join("\n");
}

function normalizeName(value: string) {
  return value.trim().replace(/^\d+\s*[.)]\s*/, "").replace(/\s+/g, " ");
}

function parseRiotId(value: string) {
  const match = value.trim().match(/^(.+?)#(.+)$/);
  if (!match) return null;

  return {
    nickname: match[1].trim(),
    tag: match[2].replace(/^#/, "").trim(),
  };
}

function getMessageHash(message: string) {
  return createHash("sha256").update(message).digest("hex");
}

async function findMatchingPlayer(participant: ParsedRecruitParticipant) {
  const name = normalizeName(participant.name);
  const riotId = parseRiotId(name);

  if (riotId?.nickname && riotId.tag) {
    const player = await prisma.player.findUnique({
      where: {
        nickname_tag: {
          nickname: riotId.nickname,
          tag: riotId.tag,
        },
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
    });

    return player ? { status: "matched" as const, players: [player] } : { status: "none" as const, players: [] };
  }

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { name },
        { nickname: name },
      ],
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
    },
    take: 3,
  });

  if (players.length === 1) return { status: "matched" as const, players };
  if (players.length > 1) return { status: "duplicate" as const, players };
  return { status: "none" as const, players };
}

function normalizeNameKey(value: string) {
  return normalizeName(value).replace(/\s+/g, "").toLowerCase();
}

function getMatchedApplyKey(playerId: number) {
  return `APPLIED:${playerId}`;
}

function getPendingApplyKey(name: string, isReserve: boolean) {
  return `PENDING:${isReserve ? "RESERVE" : "MAIN"}:${normalizeNameKey(name)}`;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .sort();
}

function sameStringArray(a: unknown, b: unknown) {
  const left = normalizeStringArray(a);
  const right = normalizeStringArray(b);

  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function sameNullableText(a: unknown, b: unknown) {
  return String(a || "").trim() === String(b || "").trim();
}

function participantSubPositions(participant: ParsedRecruitParticipant) {
  return participant.subPosition ? [participant.subPosition] : [];
}

function getParticipantSlotLabel(participant: ParsedRecruitParticipant) {
  if (participant.isReserve) {
    return `예비 ${participant.reserveSlotNumber || participant.slotNumber}`;
  }

  return String(participant.slotNumber);
}

function formatParticipantChangeLabel(
  participant: ParsedRecruitParticipant,
  player?: { name: string } | null,
) {
  const name = normalizeName(player?.name || participant.name);
  return `${getParticipantSlotLabel(participant)}. ${name}`;
}

function formatPreviousEntryLabel(entry: PreviousSeasonApplyEntry) {
  if (entry.isReserve) {
    const reserveSlotText = entry.reserveSlotNo ?? entry.slotNo ?? "";
    return `예비 ${reserveSlotText}. ${entry.name}`.replace(/\s+\./, ".");
  }

  return entry.slotNo ? `${entry.slotNo}. ${entry.name}` : entry.name;
}

function hasVisibleParticipantChange(
  previous: PreviousSeasonApplyEntry,
  participant: ParsedRecruitParticipant,
  applyTimeText: string | null,
) {
  const nextSlotNo = participant.isReserve ? null : participant.slotNumber;
  const nextReserveSlotNo = participant.isReserve ? participant.reserveSlotNumber : null;

  if (previous.isReserve !== participant.isReserve) return true;
  if (previous.slotNo !== nextSlotNo) return true;
  if (previous.reserveSlotNo !== nextReserveSlotNo) return true;
  if (!sameNullableText(previous.mainPosition, participant.mainPosition)) return true;
  if (!sameStringArray(previous.subPositions, participantSubPositions(participant))) return true;
  if (!sameNullableText(previous.applyTimeText, applyTimeText)) return true;

  if (previous.currentTier !== undefined && !sameNullableText(previous.currentTier, participant.currentTier)) {
    return true;
  }

  if (previous.peakTier !== undefined && !sameNullableText(previous.peakTier, participant.peakTier)) {
    return true;
  }

  return false;
}

function buildPreviousApplyEntryMap(
  applied: Array<{
    playerId: number;
    mainPosition: unknown;
    subPositions: unknown;
    sourceSlotNo: number | null;
    applyTimeText: string | null;
    player: { name: string };
  }>,
  pending: Array<{
    name: string;
    currentTier: string;
    peakTier: string;
    mainPosition: unknown;
    subPositions: unknown;
    isReserve: boolean;
    sourceSlotNo: number | null;
    reserveSlotNo: number | null;
    applyTimeText: string | null;
  }>,
) {
  const map = new Map<string, PreviousSeasonApplyEntry>();

  for (const item of applied) {
    const entry: PreviousSeasonApplyEntry = {
      key: getMatchedApplyKey(item.playerId),
      label: "",
      name: normalizeName(item.player.name),
      isReserve: false,
      slotNo: item.sourceSlotNo,
      reserveSlotNo: null,
      mainPosition: item.mainPosition,
      subPositions: item.subPositions,
      applyTimeText: item.applyTimeText,
    };
    entry.label = formatPreviousEntryLabel(entry);
    map.set(entry.key, entry);
  }

  for (const item of pending) {
    const entry: PreviousSeasonApplyEntry = {
      key: getPendingApplyKey(item.name, item.isReserve),
      label: "",
      name: normalizeName(item.name),
      isReserve: item.isReserve,
      slotNo: item.sourceSlotNo,
      reserveSlotNo: item.reserveSlotNo,
      mainPosition: item.mainPosition,
      subPositions: item.subPositions,
      currentTier: item.currentTier,
      peakTier: item.peakTier,
      applyTimeText: item.applyTimeText,
    };
    entry.label = formatPreviousEntryLabel(entry);
    map.set(entry.key, entry);
  }

  return map;
}

function getParticipantSnapshotKey(params: {
  participant: ParsedRecruitParticipant;
  matched: Awaited<ReturnType<typeof findMatchingPlayer>>;
}) {
  const { participant, matched } = params;

  if (!participant.isReserve && matched.status === "matched") {
    return getMatchedApplyKey(matched.players[0].id);
  }

  return getPendingApplyKey(participant.name, participant.isReserve);
}

async function applyParticipants(params: {
  parsed: ParsedRecruitMessage;
  message: string;
  roomName: string | null;
  sender: string | null;
}) {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (!season) {
    throw new Error("활성 시즌이 없습니다.");
  }

  const applyDate = getKstStartOfDate(params.parsed.applyDate);
  const sourceMessageHash = getMessageHash(params.message);
  const results: ApplyResult[] = [];
  const changes = createEmptyChangeSummary({
    currentMainCount: params.parsed.participants.filter((participant) => !participant.isReserve).length,
    currentReserveCount: params.parsed.participants.filter((participant) => participant.isReserve).length,
  });
  let cancelledCount = 0;

  const participantMatches = await Promise.all(
    params.parsed.participants.map(async (participant) => ({
      participant,
      matched: await findMatchingPlayer(participant),
    })),
  );

  const nextEntryKeys = new Set(
    participantMatches.map(({ participant, matched }) =>
      getParticipantSnapshotKey({ participant, matched }),
    ),
  );

  const activeMatchedPlayerIds = participantMatches
    .filter(({ participant, matched }) => !participant.isReserve && matched.status === "matched")
    .map(({ matched }) => matched.players[0].id);

  await prisma.$transaction(async (tx) => {
    const [previousApplied, previousPending] = await Promise.all([
      tx.seasonParticipationApply.findMany({
        where: {
          seasonId: season.id,
          applyDate,
          status: "APPLIED",
        },
        select: {
          playerId: true,
          mainPosition: true,
          subPositions: true,
          sourceSlotNo: true,
          applyTimeText: true,
          player: {
            select: {
              name: true,
            },
          },
        },
      }),
      tx.seasonParticipationPendingApply.findMany({
        where: {
          seasonId: season.id,
          applyDate,
          source: "KAKAO_RECRUIT",
        },
        select: {
          name: true,
          currentTier: true,
          peakTier: true,
          mainPosition: true,
          subPositions: true,
          isReserve: true,
          sourceSlotNo: true,
          reserveSlotNo: true,
          applyTimeText: true,
        },
      }),
    ]);

    const previousEntries = buildPreviousApplyEntryMap(previousApplied, previousPending);

    for (const entry of previousEntries.values()) {
      if (nextEntryKeys.has(entry.key)) continue;
      changes.removed.push(entry.label);
    }

    await Promise.all([
      tx.seasonParticipationApply.deleteMany({
        where: {
          seasonId: season.id,
          applyDate,
          status: "APPLIED",
          ...(activeMatchedPlayerIds.length > 0
            ? { playerId: { notIn: activeMatchedPlayerIds } }
            : {}),
        },
      }),
      tx.seasonParticipationPendingApply.deleteMany({
        where: {
          seasonId: season.id,
          applyDate,
          source: "KAKAO_RECRUIT",
        },
      }),
    ]);

    cancelledCount = changes.removed.length;

    for (const { participant, matched } of participantMatches) {
      const entryKey = getParticipantSnapshotKey({ participant, matched });
      const previousEntry = previousEntries.get(entryKey);
      const visiblyChanged = previousEntry
        ? hasVisibleParticipantChange(previousEntry, participant, params.parsed.applyTime)
        : true;
      const pendingReason =
        matched.status === "duplicate"
          ? "동명이인 또는 동일 닉네임 후보가 2명 이상입니다. 관리자 확인 필요"
          : "기존 플레이어와 매칭되지 않았습니다. 관리자 확인 필요";

      if (participant.isReserve || matched.status !== "matched") {
        const player = matched.status === "matched" ? matched.players[0] : undefined;
        const reason = participant.isReserve
          ? player
            ? "예비 참가자"
            : `예비 참가자 / ${pendingReason}`
          : pendingReason;
        const label = formatParticipantChangeLabel(participant, player);

        await tx.seasonParticipationPendingApply.upsert({
          where: {
            seasonId_applyDate_name_isReserve: {
              seasonId: season.id,
              applyDate,
              name: participant.name,
              isReserve: participant.isReserve,
            },
          },
          create: {
            seasonId: season.id,
            applyDate,
            name: participant.name,
            currentTier: participant.currentTier,
            peakTier: participant.peakTier,
            mainPosition: participant.mainPosition,
            subPositions: participant.subPosition ? [participant.subPosition] : [],
            isReserve: participant.isReserve,
            sourceSlotNo: participant.isReserve ? null : participant.slotNumber,
            reserveSlotNo: participant.reserveSlotNumber,
            reason,
            source: "KAKAO_RECRUIT",
            sourceRoom: params.roomName,
            sourceSender: params.sender,
            sourceMessageHash,
            applyTimeText: params.parsed.applyTime,
          },
          update: {
            currentTier: participant.currentTier,
            peakTier: participant.peakTier,
            mainPosition: participant.mainPosition,
            subPositions: participant.subPosition ? [participant.subPosition] : [],
            sourceSlotNo: participant.isReserve ? null : participant.slotNumber,
            reserveSlotNo: participant.reserveSlotNumber,
            reason,
            source: "KAKAO_RECRUIT",
            sourceRoom: params.roomName,
            sourceSender: params.sender,
            sourceMessageHash,
            applyTimeText: params.parsed.applyTime,
          },
        });

        if (visiblyChanged) {
          if (participant.isReserve) {
            changes.reserve.push(label);
          } else {
            changes.pending.push(label);
          }
        }

        results.push({
          participant,
          status: participant.isReserve ? "RESERVE" : "PENDING",
          reason,
          player,
        });
        continue;
      }

      const player = matched.players[0];

      await tx.seasonParticipationApply.upsert({
        where: {
          seasonId_playerId_applyDate: {
            seasonId: season.id,
            playerId: player.id,
            applyDate,
          },
        },
        create: {
          seasonId: season.id,
          playerId: player.id,
          applyDate,
          mainPosition: participant.mainPosition,
          subPositions: participant.subPosition ? [participant.subPosition] : [],
          status: "APPLIED",
          source: "KAKAO_RECRUIT",
          sourceRoom: params.roomName,
          sourceSender: params.sender,
          sourceMessageHash,
          sourceSlotNo: participant.slotNumber,
          applyTimeText: params.parsed.applyTime,
        },
        update: {
          mainPosition: participant.mainPosition,
          subPositions: participant.subPosition ? [participant.subPosition] : [],
          status: "APPLIED",
          source: "KAKAO_RECRUIT",
          sourceRoom: params.roomName,
          sourceSender: params.sender,
          sourceMessageHash,
          sourceSlotNo: participant.slotNumber,
          applyTimeText: params.parsed.applyTime,
        },
      });

      const label = formatParticipantChangeLabel(participant, player);
      const resultStatus: ApplyResult["status"] = !previousEntry
        ? "REGISTERED"
        : visiblyChanged
          ? "UPDATED"
          : "UNCHANGED";

      if (resultStatus === "REGISTERED") {
        changes.added.push(label);
      } else if (resultStatus === "UPDATED") {
        changes.updated.push(label);
      }

      results.push({
        participant,
        status: resultStatus,
        player,
      });
    }

    await writeAdminLog({
      action: "KAKAO_RECRUIT_SEASON_APPLY",
      message: `카카오 참가 자동 등록: 시즌 #${season.id} ${season.name}, 추가 ${changes.added.length}명, 수정 ${changes.updated.length}명, 제외 ${changes.removed.length}명, 보류 ${changes.pending.length}명, 예비 ${changes.reserve.length}명`,
      targetType: "Season",
      targetId: season.id,
      afterJson: {
        applyDate: applyDate.toISOString(),
        sourceMessageHash,
        cancelledCount,
        activeMatchedPlayerIds,
        changes,
        results: results.map((item) => ({
          slotNumber: item.participant.slotNumber,
          name: item.participant.name,
          status: item.status,
          reason: item.reason ?? null,
          playerId: item.player?.id ?? null,
          isReserve: item.participant.isReserve,
          reserveSlotNumber: item.participant.reserveSlotNumber,
        })),
      },
      db: tx,
    });
  });

  return { season, applyDate, results, cancelledCount, changes };
}

function rejectIfInvalidSecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");

  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (headerSecret === secret || bearer === secret || secretText === secret) {
    return null;
  }

  return kakaoJsonReply(
    {
      formatVersion: FORMAT_VERSION,
      reply: "[K-LOL.GG 참가 신청 등록 실패]",
    },
    401,
  );
}

function normalizeCommand(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function isRecruitSnapshotMessage(value: string) {
  const text = String(value || "").replace(/\r/g, "\n");

  return (
    /참가\s*신청\s*양식|협곡\s*내전|협곡내전|내전하실분/.test(text) &&
    /^\s*(?:1|예비\s*1)\s*[.)]/m.test(text)
  );
}

function getTodayKstDateText() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("오늘 날짜를 계산하지 못했습니다.");
  }

  return `${year}-${month}-${day}`;
}

async function resetTodaySeasonApply(params: {
  message: string;
  roomName: string | null;
  sender: string | null;
}) {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (!season) {
    throw new Error("활성 시즌이 없습니다.");
  }

  const todayText = getTodayKstDateText();
  const applyDate = getKstStartOfDate(todayText);

  const result = await prisma.$transaction(async (tx) => {
    const [deletedApplied, deletedPending] = await Promise.all([
      tx.seasonParticipationApply.deleteMany({
        where: {
          seasonId: season.id,
          applyDate,
        },
      }),
      tx.seasonParticipationPendingApply.deleteMany({
        where: {
          seasonId: season.id,
          applyDate,
          source: "KAKAO_RECRUIT",
        },
      }),
    ]);

    const deletedCount = deletedApplied.count + deletedPending.count;

    await writeAdminLog({
      action: "KAKAO_RECRUIT_SEASON_APPLY_RESET",
      message: `카카오 구인구직방 오늘 내전 참가 초기화: 시즌 #${season.id} ${season.name}, 신청일 ${todayText}, 확정 ${deletedApplied.count}명, 보류/예비 ${deletedPending.count}명, 총 ${deletedCount}명 삭제`,
      targetType: "Season",
      targetId: season.id,
      afterJson: {
        command: params.message,
        applyDate: applyDate.toISOString(),
        applyDateKst: todayText,
        roomName: params.roomName,
        sender: params.sender,
        deletedAppliedCount: deletedApplied.count,
        deletedPendingCount: deletedPending.count,
        deletedCount,
      },
      db: tx,
    });

    return {
      deletedAppliedCount: deletedApplied.count,
      deletedPendingCount: deletedPending.count,
      deletedCount,
    };
  });

  return {
    season,
    todayText,
    applyDate,
    deletedAppliedCount: result.deletedAppliedCount,
    deletedPendingCount: result.deletedPendingCount,
    deletedCount: result.deletedCount,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const secretRejected = rejectIfInvalidSecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = String(body.message || body.text || body.utterance || "");
    const roomName =
      typeof body.roomName === "string"
        ? body.roomName
        : typeof body.room === "string"
          ? body.room
          : null;
    const sender = typeof body.sender === "string" ? body.sender : null;

    if (normalizeCommand(message) === "오늘내전초기화") {
      const reset = await resetTodaySeasonApply({
        message,
        roomName,
        sender,
      });

      return kakaoJsonReply({
        formatVersion: FORMAT_VERSION,
        command: "TODAY_SEASON_APPLY_RESET",
        season: reset.season,
        applyDate: reset.todayText,
        deletedAppliedCount: reset.deletedAppliedCount,
        deletedPendingCount: reset.deletedPendingCount,
        deletedCount: reset.deletedCount,
        reply:
          "[K-LOL.GG 오늘내전 초기화 완료]\n" +
          `날짜: ${reset.todayText}\n` +
          `확정 참가: ${reset.deletedAppliedCount}명 삭제\n` +
          `보류/예비: ${reset.deletedPendingCount}명 삭제\n` +
          `총 ${reset.deletedCount}명 초기화`,
      });
    }

    const parsed = parseRecruitMessage(message);

    if (parsed.participants.length < 1) {
      return kakaoJsonReply({
        formatVersion: FORMAT_VERSION,
        reply: isRecruitSnapshotMessage(message)
          ? "[K-LOL.GG 내전 명단 업데이트 실패]\n참가자 이름이 1명 이상 있어야 최신 명단으로 반영됩니다."
          : "[K-LOL.GG 구인구직방 참가 자동 등록 실패]",
        parsed,
      });
    }

    const applied = await applyParticipants({
      parsed,
      message,
      roomName,
      sender,
    });

    const registered = applied.results.filter((item) => item.status === "REGISTERED").length;
    const updated = applied.results.filter((item) => item.status === "UPDATED").length;
    const pending = applied.results.filter((item) => item.status === "PENDING").length;
    const reserve = applied.results.filter((item) => item.status === "RESERVE").length;
    const unchanged = applied.results.filter((item) => item.status === "UNCHANGED").length;

    return kakaoJsonReply({
      formatVersion: FORMAT_VERSION,
      season: applied.season,
      applyDate: parsed.applyDate,
      applyTime: parsed.applyTime,
      registered,
      updated,
      cancelled: applied.cancelledCount,
      pending,
      reserve,
      unchanged,
      participants: parsed.participants,
      results: applied.results,
      reply: buildReply({
        parsed,
        seasonName: applied.season.name,
        results: applied.results,
        cancelledCount: applied.cancelledCount,
        changes: applied.changes,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return kakaoJsonReply(
      {
        formatVersion: FORMAT_VERSION,
        reply: "[K-LOL.GG 참가 신청 등록 실패]",
        error: message,
      },
      500,
    );
  }
}
