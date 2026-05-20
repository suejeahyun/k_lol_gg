export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";

type FeedbackBody = {
  matchSeriesId?: number;
  draftId?: number | null;
  selectedOptionType?: string | null;
  feedbackRating?: string | null;
  feedbackProblemTeam?: "RED" | "BLUE" | null;
  feedbackProblemLine?: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
  feedbackMemo?: string | null;
};

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = (await req.json()) as FeedbackBody;

    if (!Number.isInteger(body.matchSeriesId) || !body.matchSeriesId || body.matchSeriesId <= 0) {
      return NextResponse.json(
        { message: "내전 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const review = await prisma.balanceMatchReview.create({
      data: {
        matchSeriesId: body.matchSeriesId,
        draftId: Number.isInteger(body.draftId) && body.draftId ? body.draftId : null,
        selectedOptionType: body.selectedOptionType?.trim() || null,
        feedbackRating: body.feedbackRating?.trim() || null,
        feedbackProblemTeam: body.feedbackProblemTeam ?? null,
        feedbackProblemLine: body.feedbackProblemLine ?? null,
        feedbackMemo: body.feedbackMemo?.trim() || null,
      },
    });

    await writeAdminLog({
      action: "BALANCE_FEEDBACK_CREATE",
      message: `팀 밸런스 피드백 저장: 내전 #${body.matchSeriesId}, 리뷰 #${review.id}`,
    });

    return NextResponse.json({ review });
  } catch (error) {
    console.error("[TEAM_BALANCE_FEEDBACK_POST_ERROR]", error);
    return NextResponse.json(
      { message: "팀 밸런스 피드백 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
