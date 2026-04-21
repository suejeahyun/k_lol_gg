import { NextRequest, NextResponse } from "next/server";
import { parseNicknameTag } from "@/lib/kakao/parser";
import { getPlayerSummaryByRiotId } from "@/lib/stats/getPlayerSummaryByRiotId";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("query") ?? "";
    const { nickname, tag } = parseNicknameTag(query);

    const summary = await getPlayerSummaryByRiotId(nickname, tag);

    if (!summary) {
      return NextResponse.json(
        { message: `해당 플레이어를 찾을 수 없습니다: ${nickname}#${tag}` },
        { status: 404 }
      );
    }

    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "검색 처리 중 오류가 발생했습니다.";

    return NextResponse.json({ message }, { status: 400 });
  }
}