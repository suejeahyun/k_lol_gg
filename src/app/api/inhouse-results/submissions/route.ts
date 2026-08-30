export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import {
  getAccessErrorResponseMessage,
  requireApprovedUserOrAdmin,
} from "@/lib/auth/access";
import {
  getPublishedManagedTemplate,
  makePublicCode,
  makeSourceMessageHash,
  managedTemplateSnapshot,
  parseKstDateOnly,
} from "@/lib/kakao/managed-forms";
import { getKstDateKey } from "@/lib/date/kst";
import { logServerError } from "@/lib/server/safe-log";

type CreateSubmissionBody = {
  requestId?: unknown;
  matchDate?: unknown;
  organizer?: unknown;
  gameCount?: unknown;
  seriesNumber?: unknown;
  teamBalanceDraftId?: unknown;
  note?: unknown;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalPositiveInteger(value: unknown) {
  const text = cleanText(value);
  if (!text || text === "없음") return null;
  const number = Number(text);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

function actorDetails(access: Awaited<ReturnType<typeof requireApprovedUserOrAdmin>>) {
  if (access.type === "admin") {
    return {
      userAccountId: access.admin.user.id,
      userId: access.admin.user.userId,
    };
  }

  return {
    userAccountId: access.user.userAccountId,
    userId: access.user.userId,
  };
}

export async function GET() {
  try {
    const access = await requireApprovedUserOrAdmin();
    const actor = actorDetails(access);
    const submissions = await prisma.inhouseResultSubmission.findMany({
      where: {
        roomName: "WEB",
        status: "AWAITING_UPLOAD",
        matchSeriesId: null,
        OR: [
          { submittedByUserAccountId: actor.userAccountId },
          {
            submittedByUserAccountId: null,
            parsedData: {
              path: ["submittedByUserAccountId"],
              equals: actor.userAccountId,
            },
          },
        ],
      },
      include: { _count: { select: { images: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      ok: true,
      submissions: submissions
        .filter((submission) => submission._count.images < submission.expectedGameCount)
        .map((submission) => ({
          publicCode: submission.publicCode,
          status: submission.status,
          matchDate: getKstDateKey(submission.matchDate),
          organizer: submission.organizer,
          seriesNumber: submission.seriesNumber,
          expectedImageCount: submission.expectedGameCount,
          receivedImageCount: submission._count.images,
          canUpload: true,
        })),
    });
  } catch (error) {
    const accessError = getAccessErrorResponseMessage(error, "미완료 내전 결과를 불러오지 못했습니다.");
    if (accessError.status !== 500) {
      return NextResponse.json({ message: accessError.message }, { status: accessError.status });
    }
    logServerError("[WEB_INHOUSE_RESULT_LIST_ERROR]", error);
    return NextResponse.json({ message: accessError.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireApprovedUserOrAdmin();
    const actor = actorDetails(access);
    const body = await req.json().catch(() => null) as CreateSubmissionBody | null;

    if (!body) {
      return NextResponse.json({ message: "등록 내용을 확인해주세요." }, { status: 400 });
    }

    const requestId = cleanText(body.requestId);
    const matchDateText = cleanText(body.matchDate);
    const matchDate = parseKstDateOnly(matchDateText);
    const organizer = cleanText(body.organizer);
    const gameCount = Number(body.gameCount);
    const seriesNumber = Number(body.seriesNumber);
    const teamBalanceDraftId = optionalPositiveInteger(body.teamBalanceDraftId);
    const note = cleanText(body.note) || "없음";

    if (requestId.length < 8 || requestId.length > 100) {
      return NextResponse.json({ message: "등록 요청 정보가 올바르지 않습니다." }, { status: 400 });
    }
    if (!matchDate || !organizer || ![2, 3].includes(gameCount)) {
      return NextResponse.json({ message: "진행일, 진행자, 세트 수(2 또는 3)를 확인해주세요." }, { status: 400 });
    }
    if (!Number.isInteger(seriesNumber) || seriesNumber < 1) {
      return NextResponse.json({ message: "내전 회차는 1 이상의 숫자로 입력해주세요." }, { status: 400 });
    }
    if (Number.isNaN(teamBalanceDraftId)) {
      return NextResponse.json({ message: "팀 밸런스 번호는 숫자 또는 없음으로 입력해주세요." }, { status: 400 });
    }
    if (note.length > 1_000 || organizer.length > 100) {
      return NextResponse.json({ message: "진행자 또는 특이사항이 너무 깁니다." }, { status: 400 });
    }

    if (teamBalanceDraftId !== null) {
      const draft = await prisma.teamBalanceDraft.findUnique({
        where: { id: teamBalanceDraftId },
        select: { id: true },
      });
      if (!draft) {
        return NextResponse.json({ message: "팀 밸런스 번호를 찾을 수 없습니다." }, { status: 400 });
      }
    }

    const sender = actor.userId;
    const sourceMessageHash = makeSourceMessageHash(
      "WEB_INHOUSE_RESULT",
      "WEB",
      String(actor.userAccountId ?? sender),
      requestId,
    );
    const duplicate = await prisma.inhouseResultSubmission.findUnique({
      where: { sourceMessageHash },
      include: { _count: { select: { images: true } } },
    });
    if (duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        submission: {
          publicCode: duplicate.publicCode,
          status: duplicate.status,
          matchDate: getKstDateKey(duplicate.matchDate),
          organizer: duplicate.organizer,
          seriesNumber: duplicate.seriesNumber,
          expectedImageCount: duplicate.expectedGameCount,
          receivedImageCount: duplicate._count.images,
        },
      });
    }

    const [template, season] = await Promise.all([
      getPublishedManagedTemplate("INHOUSE_RESULT"),
      prisma.season.findFirst({
        where: { isActive: true },
        orderBy: { id: "desc" },
        select: { id: true },
      }),
    ]);
    const publicCode = makePublicCode("MR");
    const parsedData = {
      matchDate: matchDateText,
      organizer,
      gameCount: String(gameCount),
      seriesNumber: String(seriesNumber),
      teamBalanceDraftId: teamBalanceDraftId === null ? "" : String(teamBalanceDraftId),
      note,
      source: "WEB",
      submittedByUserAccountId: actor.userAccountId,
    };
    const submission = await prisma.inhouseResultSubmission.create({
      data: {
        publicCode,
        templateId: template.id,
        templateVersion: template.version,
        templateSnapshot: managedTemplateSnapshot(template),
        rawText: JSON.stringify(parsedData),
        parsedData,
        seasonId: season?.id ?? null,
        matchDate,
        organizer,
        seriesNumber,
        expectedGameCount: gameCount,
        teamBalanceDraftId,
        roomName: "WEB",
        sender,
        submittedByUserAccountId: actor.userAccountId,
        sourceMessageHash,
        status: "AWAITING_UPLOAD",
      },
    });

    return NextResponse.json({
      ok: true,
      submission: {
        publicCode: submission.publicCode,
        status: submission.status,
        matchDate: getKstDateKey(submission.matchDate),
        organizer: submission.organizer,
        seriesNumber: submission.seriesNumber,
        expectedImageCount: submission.expectedGameCount,
        receivedImageCount: 0,
      },
    }, { status: 201 });
  } catch (error) {
    const accessError = getAccessErrorResponseMessage(
      error,
      "내전 결과 접수를 생성하지 못했습니다.",
    );
    if (accessError.status !== 500) {
      return NextResponse.json({ message: accessError.message }, { status: accessError.status });
    }
    logServerError("[WEB_INHOUSE_RESULT_CREATE_ERROR]", error);
    return NextResponse.json({ message: accessError.message }, { status: 500 });
  }
}
