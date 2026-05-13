import { NextRequest, NextResponse } from "next/server";
import { parseRecruitMessage } from "@/lib/kakao/recruit-message-parser";

const KAKAO_RECRUIT_SECRET = process.env.KAKAO_RECRUIT_SECRET || "klol-recruit-7942-long-secret";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.secret !== KAKAO_RECRUIT_SECRET) {
      return NextResponse.json(
        { ok: false, reply: "[참가 신청 등록 실패]\n인증값이 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const message = String(body.message || "");
    const parsed = parseRecruitMessage(message);

    if (parsed.participants.length < 1) {
      return NextResponse.json({
        ok: false,
        reply:
          "[K-LOL.GG 구인구직방 참가 자동 등록]\n" +
          "등록 가능한 참가자를 찾지 못했습니다.\n\n" +
          "양식 예시:\n" +
          "1.정민/m/m/ad sup",
        parsed,
      });
    }

    /**
     * 여기부터는 기존 DB 저장 로직에 연결하면 됩니다.
     *
     * parsed.applyDate      => "2026-05-14"
     * parsed.applyTime      => "21:00" 또는 null
     * parsed.participants   => 정규화된 참가자 목록
     *
     * 기존 코드의 신청일 계산값 대신 parsed.applyDate를 사용하세요.
     */

    const positionCounts = {
      TOP: 0,
      JGL: 0,
      MID: 0,
      ADC: 0,
      SUP: 0,
    };

    for (const participant of parsed.participants) {
      positionCounts[participant.mainPosition]++;
    }

    const missingPositions = Object.entries(positionCounts)
      .filter(([, count]) => count === 0)
      .map(([position]) => position);

    const registerList = parsed.participants
      .map((p, index) => {
        return (
          `${index + 1}. ${p.name} / ${p.currentTier} / ${p.peakTier} / ` +
          `${p.mainPosition}` +
          `${p.subPosition ? " / " + p.subPosition : ""}`
        );
      })
      .join("\n");

    const warningText =
      parsed.warnings.length > 0
        ? "\n\n주의\n" + parsed.warnings.map((item) => "- " + item).join("\n")
        : "";

    return NextResponse.json({
      ok: true,
      applyDate: parsed.applyDate,
      applyTime: parsed.applyTime,
      participants: parsed.participants,
      reply:
        "[K-LOL.GG 구인구직방 참가 자동 등록]\n" +
        "시즌: K-LOL Season 1: Genesis\n" +
        `신청일: ${parsed.applyDate}\n` +
        `등록/수정: ${parsed.participants.length}명\n` +
        "취소: 0명\n" +
        "보류: 0명\n\n" +
        "포지션 현황\n" +
        `TOP ${positionCounts.TOP}명\n` +
        `JGL ${positionCounts.JGL}명\n` +
        `MID ${positionCounts.MID}명\n` +
        `ADC ${positionCounts.ADC}명\n` +
        `SUP ${positionCounts.SUP}명\n` +
        `부족 포지션: ${missingPositions.length > 0 ? missingPositions.join(", ") : "없음"}\n\n` +
        "등록 목록\n" +
        registerList +
        warningText,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reply: "[참가 신청 등록 실패]\n서버 처리 중 오류가 발생했습니다.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}