import { NextRequest, NextResponse } from "next/server";
import {
  parseRecruitMessage,
  type ParsedRecruitMessage,
  type ParsedRecruitParticipant,
  type RecruitPosition,
  type RecruitTier,
} from "@/lib/kakao/recruit-message-parser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KAKAO_RECRUIT_SECRET =
  process.env.KAKAO_RECRUIT_SECRET || "klol-recruit-7942-long-secret";

const FORMAT_VERSION = "season-apply-format-v2";

const POSITION_ORDER: RecruitPosition[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const TIER_SHORT_LABEL: Record<RecruitTier, string> = {
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

function formatTierShort(tier: RecruitTier): string {
  return TIER_SHORT_LABEL[tier] || tier;
}

function formatApplyDateTime(applyDate: string, applyTime: string | null): string {
  if (!applyTime) return applyDate;

  const [hourText, minuteText] = applyTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText || "0");

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return applyDate;
  }

  if (Number.isFinite(minute) && minute > 0) {
    return `${applyDate} ${hour}시 ${minute}분`;
  }

  return `${applyDate} ${hour}시`;
}

function buildPositionCounts(
  participants: ParsedRecruitParticipant[]
): Record<RecruitPosition, number> {
  const positionCounts: Record<RecruitPosition, number> = {
    TOP: 0,
    JGL: 0,
    MID: 0,
    ADC: 0,
    SUP: 0,
  };

  for (const participant of participants) {
    positionCounts[participant.mainPosition] += 1;
  }

  return positionCounts;
}

function buildRegisterList(participants: ParsedRecruitParticipant[]): string {
  return participants
    .map((participant, index) => {
      const tierText = `${formatTierShort(participant.currentTier)}-${formatTierShort(
        participant.peakTier
      )}`;
      const positionText = participant.subPosition
        ? `${participant.mainPosition}-${participant.subPosition}`
        : participant.mainPosition;

      return `${index + 1}. ${participant.name} / ${tierText} / ${positionText}`;
    })
    .join("\n");
}

function buildReply(parsed: ParsedRecruitMessage): string {
  const positionCounts = buildPositionCounts(parsed.participants);

  const positionSummary = POSITION_ORDER.map(
    (position) => `${position} ${positionCounts[position]}`
  ).join(" · ");

  const missingPositions = POSITION_ORDER.filter(
    (position) => positionCounts[position] === 0
  );

  const registerList = buildRegisterList(parsed.participants);
  const applyDateText = formatApplyDateTime(parsed.applyDate, parsed.applyTime);

  const warningText =
    parsed.warnings.length > 0
      ? "\n\n주의\n" + parsed.warnings.map((item) => `- ${item}`).join("\n")
      : "";

  return (
    "[K-LOL.GG 참가 자동 등록]\n\n" +
    "시즌: K-LOL Season 1: Genesis\n" +
    `신청일: ${applyDateText}\n\n` +
    `등록/수정 ${parsed.participants.length}명 | 취소 0명 | 보류 0명\n\n` +
    "포지션 현황\n" +
    `${positionSummary}\n\n` +
    "부족 포지션\n" +
    `${missingPositions.length > 0 ? missingPositions.join(", ") : "없음"}\n\n` +
    "등록 목록\n" +
    registerList +
    warningText
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.secret !== KAKAO_RECRUIT_SECRET) {
      return NextResponse.json(
        {
          ok: false,
          formatVersion: FORMAT_VERSION,
          reply: "[참가 신청 등록 실패]\n인증값이 올바르지 않습니다.",
        },
        { status: 401 }
      );
    }

    const message = String(body.message || "");
    const parsed = parseRecruitMessage(message);

    if (parsed.participants.length < 1) {
      return NextResponse.json({
        ok: false,
        formatVersion: FORMAT_VERSION,
        reply:
          "[K-LOL.GG 참가 자동 등록]\n\n" +
          "등록 가능한 참가자를 찾지 못했습니다.\n\n" +
          "양식 예시\n" +
          "1.정민/m/m/ad sup",
        parsed,
      });
    }

    return NextResponse.json({
      ok: true,
      formatVersion: FORMAT_VERSION,
      applyDate: parsed.applyDate,
      applyTime: parsed.applyTime,
      participants: parsed.participants,
      reply: buildReply(parsed),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        formatVersion: FORMAT_VERSION,
        reply: "[참가 신청 등록 실패]\n서버 처리 중 오류가 발생했습니다.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
