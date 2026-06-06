export const dynamic = "force-dynamic";

import { CommunityPostType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

const allowedTypes: CommunityPostType[] = ["HIGHLIGHT", "SUGGESTION", "MATCH_REVIEW", "FREE"];

const fallbackHeadlines: Record<CommunityPostType, string[]> = {
  HIGHLIGHT: ["슈퍼플레이", "한타", "솔로킬", "바론·용", "역전", "웃긴장면", "실수", "제보"],
  SUGGESTION: ["오류", "개선요청", "기능추가", "디자인", "모바일", "카카오봇", "구인구직", "완료요청"],
  MATCH_REVIEW: ["경기후기", "밴픽", "MVP", "한타", "라인전", "운영", "피드백", "리뷰"],
  FREE: ["잡담", "질문", "정보", "후기", "모집", "자랑", "유머", "기타"],
  NOTICE_COMMENT: ["확인", "질문", "의견"],
};

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as CommunityPostType | null;
  if (!type || !allowedTypes.includes(type)) {
    return NextResponse.json({ message: "게시판 유형이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const headlines = await prisma.communityHeadline.findMany({
      where: { type, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, type: true, label: true, sortOrder: true },
    });

    if (headlines.length > 0) return NextResponse.json({ headlines });

    return NextResponse.json({
      headlines: (fallbackHeadlines[type] ?? []).map((label, index) => ({
        id: 0 - index,
        type,
        label,
        sortOrder: (index + 1) * 10,
      })),
    });
  } catch (error) {
    console.error("[COMMUNITY_HEADLINES_GET_ERROR]", error);
    return NextResponse.json({
      headlines: (fallbackHeadlines[type] ?? []).map((label, index) => ({
        id: 0 - index,
        type,
        label,
        sortOrder: (index + 1) * 10,
      })),
    });
  }
}
