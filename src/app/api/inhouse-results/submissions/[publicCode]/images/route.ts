export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import {
  getAccessErrorResponseMessage,
  requireApprovedUserOrAdmin,
} from "@/lib/auth/access";
import {
  deletePrivateAsset,
  storePrivateImage,
  validatePrivateImage,
} from "@/lib/storage/private-assets";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{ publicCode: string }>;
};

function publicUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const allowedPrefixes = [
    "비어 있는 이미지는",
    "카카오 사진 한 장은",
    "PNG, JPG 또는 WebP",
    "파일 확장자와 실제 이미지",
    "이미지 크기가 올바르지",
  ];
  return allowedPrefixes.some((prefix) => message.startsWith(prefix)) ? message : null;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const access = await requireApprovedUserOrAdmin();
    const { publicCode: rawPublicCode } = await params;
    const publicCode = decodeURIComponent(rawPublicCode || "").trim().toUpperCase();

    if (!/^MR[A-F0-9]{10}$/.test(publicCode)) {
      return NextResponse.json({ message: "MR로 시작하는 접수번호를 확인해주세요." }, { status: 400 });
    }

    const formData = await req.formData().catch(() => null);
    const file = formData?.get("image");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ message: "등록할 사진 한 장을 선택해주세요." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validatePrivateImage(buffer, file.type || null);
    const submission = await prisma.inhouseResultSubmission.findUnique({
      where: { publicCode },
      include: {
        images: {
          include: { privateAsset: { select: { sha256: true } } },
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
      return NextResponse.json({ message: "본인이 만든 내전 결과 접수에만 사진을 등록할 수 있습니다." }, { status: 403 });
    }
    if (submission.matchSeriesId) {
      return NextResponse.json({ message: "이미 내전 결과 등록이 완료된 접수입니다." }, { status: 409 });
    }
    if (submission.images.some((image) => image.privateAsset.sha256 === validated.sha256)) {
      return NextResponse.json({ message: "같은 사진이 이미 등록되어 있습니다." }, { status: 409 });
    }
    if (submission.images.length >= submission.expectedGameCount || submission.status !== "AWAITING_UPLOAD") {
      return NextResponse.json({ message: "필요한 사진이 이미 모두 등록되어 검토 대기 중입니다." }, { status: 409 });
    }

    const requestedGameNumber = submission.images.length + 1;
    const asset = await storePrivateImage({
      buffer,
      purpose: "INHOUSE_RESULT",
      publicCode,
      imageNumber: requestedGameNumber,
      declaredMimeType: file.type || null,
    });

    let result: { imageNumber: number; receivedImageCount: number; expectedImageCount: number; complete: boolean };
    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "InhouseResultSubmission" WHERE "id" = ${submission.id} FOR UPDATE`;
        const current = await tx.inhouseResultSubmission.findUnique({
          where: { id: submission.id },
          include: {
            images: {
              include: { privateAsset: { select: { sha256: true } } },
            },
          },
        });
        if (!current || current.matchSeriesId || current.status !== "AWAITING_UPLOAD") {
          throw new Error("SUBMISSION_NOT_UPLOADABLE");
        }
        if (current.images.some((image) => image.privateAsset.sha256 === validated.sha256)) {
          throw new Error("SUBMISSION_DUPLICATE_IMAGE");
        }

        const imageNumber = current.images.length + 1;
        if (imageNumber > current.expectedGameCount) {
          throw new Error("SUBMISSION_ALREADY_COMPLETE");
        }

        await tx.inhouseResultImage.create({
          data: {
            submissionId: current.id,
            privateAssetId: asset.id,
            gameNumber: imageNumber,
          },
        });

        const complete = imageNumber >= current.expectedGameCount;
        await tx.inhouseResultSubmission.update({
          where: { id: current.id },
          data: { status: complete ? "PENDING_REVIEW" : "AWAITING_UPLOAD" },
        });
        await tx.kakaoImageReceiveSession.updateMany({
          where: {
            targetType: "InhouseResultSubmission",
            targetId: current.id,
            status: "ACTIVE",
          },
          data: {
            receivedImageCount: imageNumber,
            status: complete ? "COMPLETE" : "ACTIVE",
          },
        });

        return {
          imageNumber,
          receivedImageCount: imageNumber,
          expectedImageCount: current.expectedGameCount,
          complete,
        };
      });
    } catch (transactionError) {
      await deletePrivateAsset(asset.storageKey).catch(() => undefined);
      await prisma.privateAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
      throw transactionError;
    }

    return NextResponse.json({
      ok: true,
      publicCode,
      ...result,
      status: result.complete ? "PENDING_REVIEW" : "AWAITING_UPLOAD",
    });
  } catch (error) {
    const accessError = getAccessErrorResponseMessage(error, "사진을 등록하지 못했습니다.");
    if (accessError.status !== 500) {
      return NextResponse.json({ message: accessError.message }, { status: accessError.status });
    }
    if (error instanceof Error && ["SUBMISSION_NOT_UPLOADABLE", "SUBMISSION_ALREADY_COMPLETE"].includes(error.message)) {
      return NextResponse.json({ message: "다른 요청에서 사진 등록이 완료되었습니다. 상태를 다시 확인해주세요." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "SUBMISSION_DUPLICATE_IMAGE") {
      return NextResponse.json({ message: "같은 사진이 이미 등록되어 있습니다." }, { status: 409 });
    }
    const safeInputError = publicUploadError(error);
    if (safeInputError) return NextResponse.json({ message: safeInputError }, { status: 400 });
    logServerError("[WEB_INHOUSE_RESULT_IMAGE_UPLOAD_ERROR]", error);
    return NextResponse.json({ message: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
