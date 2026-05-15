import { NextRequest, NextResponse } from "next/server";
import { addDays, getKstDateKey, getKstDisplayDate, getKstStartOfDate } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_COUNT = 10;

type PositionKey = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

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

function emptyReply(extra: Record<string, unknown> = {}) {
  return jsonReply("", { empty: true, ...extra });
}

function rejectIfInvalidSecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");

  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (headerSecret === secret || bearer === secret || querySecret === secret || secretText === secret) {
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
  return value === "TOP" || value === "JGL" || value === "MID" || value === "ADC" || value === "SUP";
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

function formatSeasonRecruitDateTime(dateKey: string, applies: Array<{ applyTimeText: string | null }>) {
  const timeText = applies.find((apply) => apply.applyTimeText)?.applyTimeText;
  const dateText = getKstDisplayDate(dateKey);

  if (!timeText) return dateText;

  const [hourText, minuteText] = timeText.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText || "0");

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return dateText;
  if (Number.isFinite(minute) && minute > 0) return `${dateText} ${hour}시 ${minute}분`;

  return `${dateText} ${hour}시`;
}

function buildSeasonRecruitStatusTemplate(params: {
  dateKey: string;
  applies: Array<{
    mainPosition: string | null;
    subPositions: string[];
    applyTimeText: string | null;
    player: {
      name: string;
      currentTier: string | null;
      peakTier: string | null;
    };
  }>;
}) {
  const lines: string[] = [];

  lines.push("📢 협곡내전하실분");
  lines.push(` 》${formatSeasonRecruitDateTime(params.dateKey, params.applies)}`);
  lines.push("");
  lines.push("*참가 신청 양식*");
  lines.push("이름/현티어/최고티어/주,부라인");
  lines.push("EX) 1.지후/P/E/AD,MD");
  lines.push("");

  for (let index = 0; index < TARGET_COUNT; index += 1) {
    const apply = params.applies[index];

    if (!apply) {
      lines.push(`${index + 1}.`);
      continue;
    }

    const currentTier = normalizeTier(apply.player.currentTier);
    const peakTier = normalizeTier(apply.player.peakTier);
    const positionText = formatPositions(apply.mainPosition, apply.subPositions);

    lines.push(`${index + 1}. ${apply.player.name}/${currentTier}/${peakTier}/${positionText}`);
  }

  return lines.join("\n");
}

async function createStatusReply(req: NextRequest, body?: ApplyStatusBody) {
  const secretRejected = rejectIfInvalidSecret(req, body?.secret);
  if (secretRejected) return secretRejected;

  const dateKey = getKstDateKey();
  const start = getKstStartOfDate(dateKey);
  const end = addDays(start, 1);
  end.setMilliseconds(end.getMilliseconds() - 1);

  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (!season) {
    return emptyReply({
      activeSeasonId: null,
      total: 0,
      warning: "활성 시즌이 없습니다.",
      dateKey,
    });
  }

  const applies = await prisma.seasonParticipationApply.findMany({
    where: {
      seasonId: season.id,
      status: "APPLIED",
      applyDate: {
        gte: start,
        lte: end,
      },
    },
    select: {
      id: true,
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
      { sourceSlotNo: "asc" },
      { createdAt: "asc" },
    ],
    take: TARGET_COUNT,
  });

  if (applies.length === 0) {
    return emptyReply({
      activeSeasonId: season.id,
      seasonName: season.name,
      total: 0,
      dateKey,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  }

  const reply = buildSeasonRecruitStatusTemplate({
    dateKey,
    applies: applies.map((apply) => ({
      applyTimeText: apply.applyTimeText,
      mainPosition: apply.mainPosition,
      subPositions: apply.subPositions,
      player: apply.player,
    })),
  });

  return jsonReply(reply, {
    empty: false,
    activeSeasonId: season.id,
    seasonName: season.name,
    total: applies.length,
    dateKey,
    dateRange: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return await createStatusReply(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonReply(`[K-LOL.GG 내전현황]\n현황을 불러오지 못했습니다.\n${message}`, {}, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as ApplyStatusBody;
    return await createStatusReply(req, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonReply(`[K-LOL.GG 내전현황]\n현황을 불러오지 못했습니다.\n${message}`, {}, 500);
  }
}
