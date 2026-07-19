import { requireSiteFeature } from "@/lib/site/feature-guard";
import { NextRequest, NextResponse } from "next/server";
import { addDays, getKstDateKey, getKstDisplayDate, getKstStartOfDate } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import { getRequiredSecretInProduction, matchesRequestSecret } from "@/lib/security/secrets";
import { logServerError } from "@/lib/server/safe-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_COUNT = 10;

type PositionKey = "TOP" | "JGL" | "MID" | "ADC" | "SUP" | "ALL";

type TierKey =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER"
  | "UNRANKED";

type ApplyStatusBody = {
  secret?: string | null;
  message?: string | null;
  recruitNo?: number | string | null;
};

type SeasonRecruitStatusEntry = {
  recruitNo: number;
  sourceSlotNo: number | null;
  reserveSlotNo: number | null;
  isReserve: boolean;
  mainPosition: string | null;
  subPositions: string[];
  applyTimeText: string | null;
  createdAt: Date;
  player: {
    name: string;
    currentTier: string | null;
    peakTier: string | null;
  };
};

const TIER_SHORT_LABEL: Record<TierKey, string> = {
  IRON: "I",
  BRONZE: "B",
  SILVER: "S",
  GOLD: "G",
  PLATINUM: "P",
  EMERALD: "E",
  DIAMOND: "D",
  MASTER: "M",
  GRANDMASTER: "GM",
  CHALLENGER: "C",
  UNRANKED: "U",
};

const POSITION_SHORT_LABEL: Record<PositionKey, string> = {
  TOP: "top",
  JGL: "jg",
  MID: "mid",
  ADC: "ad",
  SUP: "sup",
  ALL: "all",
};

function jsonReply(reply: string, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json(
    {
      ok: status >= 200 && status < 300,
      statusCode: status,
      reply,
      ...extra,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function rejectIfInvalidSecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");

  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (
    matchesRequestSecret(secret, {
      headers: [headerSecret],
      bearer,
      body: secretText,
      query: querySecret,
    })
  ) {
    return null;
  }

  return jsonReply("[K-LOL.GG 내전현황]\n인증값이 올바르지 않습니다.", {}, 401);
}

function normalizeTier(value: string | null | undefined) {
  const text = String(value || "UNRANKED").trim().toUpperCase();

  if (text in TIER_SHORT_LABEL) {
    return TIER_SHORT_LABEL[text as TierKey];
  }

  const first = text.charAt(0);
  if (first && first in TIER_SHORT_LABEL) {
    return TIER_SHORT_LABEL[first as TierKey];
  }

  if (text.includes("아이언")) return "I";
  if (text.includes("브론즈")) return "B";
  if (text.includes("실버")) return "S";
  if (text.includes("골드")) return "G";
  if (text.includes("플래") || text.includes("플레")) return "P";
  if (text.includes("에메")) return "E";
  if (text.includes("다이아")) return "D";
  if (text.includes("마스터") || text === "마") return "M";
  if (text.includes("그마") || text.includes("그랜드마스터")) return "GM";
  if (text.includes("챌")) return "C";

  return "U";
}

function isPositionKey(value: unknown): value is PositionKey {
  return value === "TOP" || value === "JGL" || value === "MID" || value === "ADC" || value === "SUP" || value === "ALL";
}

function formatPositions(mainPosition: unknown, subPositions: unknown) {
  const positions: string[] = [];

  if (isPositionKey(mainPosition)) {
    positions.push(POSITION_SHORT_LABEL[mainPosition]);
  }

  if (Array.isArray(subPositions)) {
    for (const subPosition of subPositions) {
      if (isPositionKey(subPosition) && subPosition !== mainPosition) {
        positions.push(POSITION_SHORT_LABEL[subPosition]);
      }
    }
  }

  return positions.length > 0 ? positions.join(" ") : "-";
}

function formatSeasonRecruitDateTime(dateKey: string, entries: Array<{ applyTimeText: string | null }>) {
  const timeText = entries.find((entry) => entry.applyTimeText)?.applyTimeText;
  const dateText = getKstDisplayDate(dateKey);

  if (!timeText) return dateText;

  const [hourText, minuteText] = timeText.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText || "0");

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return dateText;
  if (Number.isFinite(minute) && minute > 0) return `${dateText} ${hour}시 ${minute}분`;

  return `${dateText} ${hour}시`;
}

function compareStatusEntry(a: SeasonRecruitStatusEntry, b: SeasonRecruitStatusEntry) {
  const aSlot = a.isReserve ? a.reserveSlotNo : a.sourceSlotNo;
  const bSlot = b.isReserve ? b.reserveSlotNo : b.sourceSlotNo;

  if (aSlot != null && bSlot != null && aSlot !== bSlot) return aSlot - bSlot;
  if (aSlot != null && bSlot == null) return -1;
  if (aSlot == null && bSlot != null) return 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function placeMainEntries(entries: SeasonRecruitStatusEntry[]) {
  const slots: Array<SeasonRecruitStatusEntry | null> = Array.from({ length: TARGET_COUNT }, () => null);
  const overflow: SeasonRecruitStatusEntry[] = [];

  for (const entry of entries.sort(compareStatusEntry)) {
    const slotNo = entry.sourceSlotNo;

    if (slotNo != null && slotNo >= 1 && slotNo <= TARGET_COUNT && !slots[slotNo - 1]) {
      slots[slotNo - 1] = entry;
      continue;
    }

    const emptyIndex = slots.findIndex((item) => !item);
    if (emptyIndex >= 0) {
      slots[emptyIndex] = entry;
    } else {
      overflow.push(entry);
    }
  }

  return { slots, overflow };
}

function formatEntryLine(prefix: string, entry: SeasonRecruitStatusEntry | null) {
  if (!entry) return `${prefix}.`;

  const currentTier = normalizeTier(entry.player.currentTier);
  const peakTier = normalizeTier(entry.player.peakTier);
  const positionText = formatPositions(entry.mainPosition, entry.subPositions);

  return `${prefix}. ${entry.player.name}/${currentTier}/${peakTier}/${positionText}`;
}

function buildSeasonRecruitStatusTemplate(params: {
  recruitNo: number;
  dateKey: string;
  entries: SeasonRecruitStatusEntry[];
}) {
  const lines: string[] = [];
  const mainEntries = params.entries.filter((entry) => !entry.isReserve);
  const reserveEntries = params.entries.filter((entry) => entry.isReserve).sort(compareStatusEntry);
  const placed = placeMainEntries(mainEntries);

  lines.push(`📢 협곡내전하실분 #${params.recruitNo}`);
  lines.push(` 》${formatSeasonRecruitDateTime(params.dateKey, params.entries)}`);
  lines.push("");
  lines.push("*참가 신청 양식*");
  lines.push("이름/현티어/최고티어/주,부라인");
  lines.push("EX) 1.지후/P/E/AD,MD");
  lines.push("");

  for (let index = 0; index < TARGET_COUNT; index += 1) {
    lines.push(formatEntryLine(String(index + 1), placed.slots[index]));
  }

  for (const overflowEntry of placed.overflow) {
    lines.push(formatEntryLine(String(lines.length + 1), overflowEntry));
  }

  if (reserveEntries.length > 0) {
    lines.push("");
    reserveEntries.forEach((entry, index) => {
      lines.push(formatEntryLine(`예비 ${entry.reserveSlotNo || index + 1}`, entry));
    });
  }

  return lines.join("\n");
}

function extractRequestedRecruitNo(value: unknown) {
  const text = String(value || "").trim();
  const directNo = Number(text);

  if (/^\d{1,3}$/.test(text) && Number.isInteger(directNo) && directNo >= 1 && directNo <= 999) {
    return directNo;
  }
  const patterns = [
    /(?:내전현황|AI공지|시즌내전현황)\s*#?\s*(\d{1,3})/i,
    /(?:내전\s*(?:번호|NO|No|no)\s*[:：]?\s*#?\s*)(\d{1,3})/i,
    /#\s*(\d{1,3})\s*(?:협곡\s*내전|협곡내전|내전)/i,
    /(?:협곡\s*내전|협곡내전|내전)\s*(?:하실분|하실\s*분|구인|모집)?\s*#\s*(\d{1,3})/i,
    /(?:협곡\s*내전|협곡내전|내전)\s*#\s*(\d{1,3})/i,
    /^#?\s*(\d{1,3})$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const recruitNo = Number(match[1]);
    if (Number.isInteger(recruitNo) && recruitNo >= 1 && recruitNo <= 999) {
      return recruitNo;
    }
  }

  return null;
}

function groupEntriesByRecruitNo(entries: SeasonRecruitStatusEntry[]) {
  const grouped = new Map<number, SeasonRecruitStatusEntry[]>();

  for (const entry of entries) {
    const recruitNo = entry.recruitNo || 1;
    const list = grouped.get(recruitNo) ?? [];
    list.push(entry);
    grouped.set(recruitNo, list);
  }

  return grouped;
}

function buildSeasonRecruitListReply(dateKey: string, grouped: Map<number, SeasonRecruitStatusEntry[]>) {
  const lines: string[] = [];
  const recruitNos: number[] = [];

  lines.push("[K-LOL.GG 내전현황]");
  lines.push("");

  [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([recruitNo, entries]) => {
      const mainCount = entries.filter((entry) => !entry.isReserve).length;
      const reserveCount = entries.filter((entry) => entry.isReserve).length;
      const dateTimeText = formatSeasonRecruitDateTime(dateKey, entries);
      const reserveText = reserveCount > 0 ? ` / 예비 ${reserveCount}` : "";

      recruitNos.push(recruitNo);
      lines.push(`#${recruitNo} ${dateTimeText} (${mainCount}/${TARGET_COUNT}${reserveText})`);
    });

  lines.push("");
  lines.push(`상세/복사용: ${recruitNos.map((recruitNo) => `내전현황 ${recruitNo}`).join(" / ")}`);

  return lines.join("\n").trim();
}

async function createStatusReply(req: NextRequest, body?: ApplyStatusBody) {
  const secretRejected = rejectIfInvalidSecret(req, body?.secret);
  if (secretRejected) return secretRejected;

  const rawMessage =
    body?.message ??
    req.nextUrl.searchParams.get("message") ??
    req.nextUrl.searchParams.get("q") ??
    "";
  if (String(rawMessage || "").trim()) {
    const classification = classifyKakaoRecruitMessage(String(rawMessage));
    if (classification.kind !== "SEASON_RECRUIT") {
      return jsonReply(
        buildWrongRecruitApiReply({ expected: "내전구인", actual: classification.kind }),
        {},
        400,
      );
    }
  }

  const dateKey = getKstDateKey();
  const start = getKstStartOfDate(dateKey);
  const end = addDays(start, 1);
  end.setMilliseconds(end.getMilliseconds() - 1);

  const requestedRecruitNo =
    extractRequestedRecruitNo(body?.recruitNo) ??
    extractRequestedRecruitNo(body?.message) ??
    extractRequestedRecruitNo(req.nextUrl.searchParams.get("recruitNo")) ??
    extractRequestedRecruitNo(req.nextUrl.searchParams.get("no")) ??
    extractRequestedRecruitNo(req.nextUrl.searchParams.get("message"));

  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (!season) {
    return jsonReply("[K-LOL.GG 내전현황]\n현재 활성화된 시즌이 없습니다.", {
      empty: true,
      activeSeasonId: null,
      total: 0,
      warning: "활성 시즌이 없습니다.",
      dateKey,
    });
  }

  const [applies, pendingApplies] = await Promise.all([
    prisma.seasonParticipationApply.findMany({
      where: {
        seasonId: season.id,
        status: "APPLIED",
        applyDate: {
          gte: start,
          lte: end,
        },
        ...(requestedRecruitNo ? { recruitNo: requestedRecruitNo } : {}),
      },
      select: {
        id: true,
        recruitNo: true,
        mainPosition: true,
        subPositions: true,
        sourceSlotNo: true,
        applyTimeText: true,
        createdAt: true,
        player: {
          select: {
            name: true,
            currentTier: true,
            peakTier: true,
          },
        },
      },
      orderBy: [
        { recruitNo: "asc" },
        { sourceSlotNo: "asc" },
        { createdAt: "asc" },
      ],
      take: 200,
    }),
    prisma.seasonParticipationPendingApply.findMany({
      where: {
        seasonId: season.id,
        applyDate: {
          gte: start,
          lte: end,
        },
        source: "KAKAO_RECRUIT",
        ...(requestedRecruitNo ? { recruitNo: requestedRecruitNo } : {}),
      },
      select: {
        id: true,
        recruitNo: true,
        name: true,
        currentTier: true,
        peakTier: true,
        mainPosition: true,
        subPositions: true,
        isReserve: true,
        sourceSlotNo: true,
        reserveSlotNo: true,
        applyTimeText: true,
        createdAt: true,
      },
      orderBy: [
        { recruitNo: "asc" },
        { isReserve: "asc" },
        { sourceSlotNo: "asc" },
        { reserveSlotNo: "asc" },
        { createdAt: "asc" },
      ],
      take: 200,
    }),
  ]);

  const entries: SeasonRecruitStatusEntry[] = [
    ...applies.map((apply) => ({
      recruitNo: apply.recruitNo || 1,
      sourceSlotNo: apply.sourceSlotNo,
      reserveSlotNo: null,
      isReserve: false,
      mainPosition: apply.mainPosition,
      subPositions: apply.subPositions,
      applyTimeText: apply.applyTimeText,
      createdAt: apply.createdAt,
      player: apply.player,
    })),
    ...pendingApplies.map((apply) => ({
      recruitNo: apply.recruitNo || 1,
      sourceSlotNo: apply.sourceSlotNo,
      reserveSlotNo: apply.reserveSlotNo,
      isReserve: apply.isReserve,
      mainPosition: apply.mainPosition,
      subPositions: apply.subPositions,
      applyTimeText: apply.applyTimeText,
      createdAt: apply.createdAt,
      player: {
        name: apply.name,
        currentTier: apply.currentTier,
        peakTier: apply.peakTier,
      },
    })),
  ];

  if (entries.length === 0) {
    return jsonReply("[K-LOL.GG 내전현황]\n오늘 등록된 내전 신청이 없습니다.\n\n참가 신청: 내전참가", {
      empty: true,
      activeSeasonId: season.id,
      seasonName: season.name,
      total: 0,
      pendingTotal: 0,
      reserveTotal: 0,
      dateKey,
      recruitNo: requestedRecruitNo,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  }

  const grouped = groupEntriesByRecruitNo(entries);
  const shouldShowList = !requestedRecruitNo && grouped.size > 1;
  const targetRecruitNo = requestedRecruitNo ?? [...grouped.keys()].sort((a, b) => a - b)[0];
  const targetEntries = grouped.get(targetRecruitNo) ?? [];

  const reply = shouldShowList
    ? buildSeasonRecruitListReply(dateKey, grouped)
    : buildSeasonRecruitStatusTemplate({
        recruitNo: targetRecruitNo,
        dateKey,
        entries: targetEntries,
      });

  return jsonReply(reply, {
    empty: false,
    activeSeasonId: season.id,
    seasonName: season.name,
    total: entries.length,
    appliedTotal: applies.length,
    pendingTotal: pendingApplies.filter((apply) => !apply.isReserve).length,
    reserveTotal: pendingApplies.filter((apply) => apply.isReserve).length,
    recruitNo: targetRecruitNo,
    availableRecruitNos: [...grouped.keys()].sort((a, b) => a - b),
    dateKey,
    dateRange: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    return await createStatusReply(req);
  } catch (error) {
    logServerError("[KAKAO_SEASON_APPLY_STATUS_GET_ERROR]", error, {
      endpoint: "/api/kakao/recruit/season-apply/status",
    });
    return jsonReply("[K-LOL.GG 내전현황]\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.", {}, 500);
  }
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    const body = (await req.json().catch(() => ({}))) as ApplyStatusBody;
    return await createStatusReply(req, body);
  } catch (error) {
    logServerError("[KAKAO_SEASON_APPLY_STATUS_POST_ERROR]", error, {
      endpoint: "/api/kakao/recruit/season-apply/status",
    });
    return jsonReply("[K-LOL.GG 내전현황]\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.", {}, 500);
  }
}
