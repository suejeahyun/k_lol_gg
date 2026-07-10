import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import { applyBalanceFeedbackToProfiles } from "@/lib/balance/feedback-learning";
import { logServerError } from "@/lib/server/safe-log";

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
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

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

    const matchSeriesId = Number(body.matchSeriesId);
    const targetDraftId = Number.isInteger(body.draftId) && body.draftId ? Number(body.draftId) : null;
    const feedbackData = {
      feedbackRating: body.feedbackRating?.trim() || null,
      feedbackProblemTeam: body.feedbackProblemTeam ?? null,
      feedbackProblemLine: body.feedbackProblemLine ?? null,
      feedbackMemo: body.feedbackMemo?.trim() || null,
    };

    const result = await prisma.$transaction(async (tx) => {
      const existingReview = await tx.balanceMatchReview.findFirst({
        where: {
          matchSeriesId,
          ...(targetDraftId ? { draftId: targetDraftId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      const review = existingReview
        ? await tx.balanceMatchReview.update({
            where: { id: existingReview.id },
            data: feedbackData,
          })
        : await tx.balanceMatchReview.create({
            data: {
              matchSeriesId,
              draftId: targetDraftId,
              selectedOptionType: body.selectedOptionType?.trim() || null,
              ...feedbackData,
            },
          });

      const learning = await applyBalanceFeedbackToProfiles(tx, {
        matchSeriesId,
        feedbackRating: feedbackData.feedbackRating,
        feedbackProblemTeam: feedbackData.feedbackProblemTeam,
        feedbackProblemLine: feedbackData.feedbackProblemLine,
      });

      return { review, learning };
    });

    await writeAdminLog({
      action: "BALANCE_FEEDBACK_SAVE",
      message: `팀 밸런스 피드백 저장: 내전 #${matchSeriesId}, 리뷰 #${result.review.id}, MMR 보정 ${result.learning.adjustedPlayers}명`,
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("[TEAM_BALANCE_FEEDBACK_POST_ERROR]", error);
    return NextResponse.json(
      { message: "팀 밸런스 피드백 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

