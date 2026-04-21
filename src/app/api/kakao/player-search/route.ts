import { NextRequest, NextResponse } from "next/server";
import { extractKakaoUtterance, parseNicknameTag } from "@/lib/kakao/parser";
import {
  createKakaoErrorResponse,
  createKakaoPlayerSummaryResponse,
} from "@/lib/kakao/response";
import { getPlayerSummaryByRiotId } from "@/lib/stats/getPlayerSummaryByRiotId";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const utterance = extractKakaoUtterance(body);

    const { nickname, tag } = parseNicknameTag(utterance);

    const summary = await getPlayerSummaryByRiotId(nickname, tag);

    if (!summary) {
      return NextResponse.json(
        createKakaoErrorResponse(
          `해당 플레이어를 찾을 수 없습니다.\n입력값: ${nickname}#${tag}`
        )
      );
    }

    return NextResponse.json(createKakaoPlayerSummaryResponse(summary));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "조회 중 오류가 발생했습니다.";

    return NextResponse.json(createKakaoErrorResponse(message));
  }
}