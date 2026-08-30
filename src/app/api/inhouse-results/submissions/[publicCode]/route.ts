export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import {
  getAccessErrorResponseMessage,
  requireApprovedUserOrAdmin,
} from "@/lib/auth/access";
import { getKstDateKey } from "@/lib/date/kst";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{ publicCode: string }>;
};

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const access = await requireApprovedUserOrAdmin();
    const { publicCode: rawPublicCode } = await params;
    const publicCode = decodeURIComponent(rawPublicCode || "").trim().toUpperCase();

    if (!/^MR[A-F0-9]{10}$/.test(publicCode)) {
      return NextResponse.json({ message: "MR로 시작하는 접수번호를 확인해주세요." }, { status: 400 });
    }

    const submission = await prisma.inhouseResultSubmission.findUnique({
      where: { publicCode },
      include: {
        images: {
          select: { gameNumber: true },
          orderBy: { gameNumber: "asc" },
        },
      },
    });

    if (!submission) {
      return NextResponse.json({ message: "내전 결과 접수번호를 찾을 수 없습니다." }, { status: 404 });
    }
    if (access.type === "user" && submission.roomName !== "WEB") {
      return NextResponse.json({ message: "카카오에서 만든 접수는 관리자만 사이트에서 복구할 수 있습니다." }, { status: 403 });
    }
    const parsedData = submission.parsedData as Record<string, unknown>;
    const submittedByUserAccountId = Number(parsedData.submittedByUserAccountId);
    if (access.type === "user" && submittedByUserAccountId !== access.user.userAccountId) {
      return NextResponse.json({ message: "본인이 만든 내전 결과 접수만 조회할 수 있습니다." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      submission: {
        publicCode: submission.publicCode,
        status: submission.status,
        matchDate: getKstDateKey(submission.matchDate),
        organizer: submission.organizer,
        seriesNumber: submission.seriesNumber,
        expectedImageCount: submission.expectedGameCount,
        receivedImageCount: submission.images.length,
        receivedGameNumbers: submission.images.map((image) => image.gameNumber),
        canUpload: submission.status === "AWAITING_UPLOAD" && submission.images.length < submission.expectedGameCount,
      },
    });
  } catch (error) {
    const accessError = getAccessErrorResponseMessage(error, "내전 결과 접수를 조회하지 못했습니다.");
    if (accessError.status !== 500) {
      return NextResponse.json({ message: accessError.message }, { status: accessError.status });
    }
    logServerError("[WEB_INHOUSE_RESULT_STATUS_ERROR]", error);
    return NextResponse.json({ message: accessError.message }, { status: 500 });
  }
}
