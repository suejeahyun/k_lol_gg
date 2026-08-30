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
import { currentDisciplineEvidenceCount } from "@/lib/discipline/evidence-batch";
import { isDisciplineRecordOwner } from "@/lib/discipline/ownership";

type RouteContext = {
  params: Promise<{ publicCode: string }>;
};

function isPublicImageError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return [
    "비어 있는 이미지는",
    "카카오 사진 한 장은",
    "PNG, JPG 또는 WebP",
    "파일 확장자와 실제 이미지",
    "이미지 크기가 올바르지",
  ].some((prefix) => message.startsWith(prefix));
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const access = await requireApprovedUserOrAdmin();
    const { publicCode: rawPublicCode } = await params;
    const publicCode = decodeURIComponent(rawPublicCode || "").trim().toUpperCase();
    if (!/^WR[A-F0-9]{10}$/.test(publicCode)) {
      return NextResponse.json({ message: "WR로 시작하는 인증번호를 확인해주세요." }, { status: 400 });
    }

    const task = await prisma.disciplineResolutionTask.findUnique({
      where: { publicCode },
      include: {
        disciplineRecord: { select: { userAccountId: true, playerId: true } },
        evidence: { include: { privateAsset: { select: { sha256: true } } } },
      },
    });
    if (!task) return NextResponse.json({ message: "경고 차감 인증 과제를 찾을 수 없습니다." }, { status: 404 });

    if (access.type === "user" && !isDisciplineRecordOwner(task.disciplineRecord, access.user)) {
      return NextResponse.json({ message: "본인의 경고 차감 사진만 제출할 수 있습니다." }, { status: 403 });
    }
    if (task.dueAt <= new Date()) {
      return NextResponse.json({ message: "경고 차감 인증 기한이 지났습니다. 관리자에게 문의해주세요." }, { status: 409 });
    }
    const currentEvidenceCount = currentDisciplineEvidenceCount(task.evidence, task.reviewedAt);
    if (!["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(task.status) || currentEvidenceCount >= task.requiredGameCount) {
      return NextResponse.json({ message: "사진 제출이 끝났거나 현재 사진을 받을 수 없는 상태입니다." }, { status: 409 });
    }

    const formData = await req.formData().catch(() => null);
    const file = formData?.get("image");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ message: "등록할 사진 한 장을 선택해주세요." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validatePrivateImage(buffer, file.type || null);
    if (task.evidence.some((item) => item.privateAsset.sha256 === validated.sha256)) {
      return NextResponse.json({ message: "이 인증에 이미 제출한 사진입니다. 다른 게임 사진을 선택해주세요." }, { status: 409 });
    }

    const asset = await storePrivateImage({
      buffer,
      purpose: "DISCIPLINE_RESOLUTION",
      publicCode: task.publicCode,
      imageNumber: currentEvidenceCount + 1,
      declaredMimeType: file.type || null,
    });

    let result: { receivedImageCount: number; requiredGameCount: number; complete: boolean };
    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "DisciplineResolutionTask" WHERE "id" = ${task.id} FOR UPDATE`;
        const current = await tx.disciplineResolutionTask.findUnique({
          where: { id: task.id },
          include: {
            evidence: {
              include: { privateAsset: { select: { sha256: true } } },
            },
          },
        });
        if (!current || !["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(current.status)) {
          throw new Error("TASK_NOT_UPLOADABLE");
        }
        if (current.dueAt <= new Date()) throw new Error("TASK_EXPIRED");
        if (current.evidence.some((item) => item.privateAsset.sha256 === validated.sha256)) {
          throw new Error("TASK_DUPLICATE_IMAGE");
        }
        const receivedImageCount = currentDisciplineEvidenceCount(
          current.evidence,
          current.reviewedAt,
        ) + 1;
        if (receivedImageCount > current.requiredGameCount) throw new Error("TASK_ALREADY_COMPLETE");

        await tx.disciplineEvidence.create({
          data: {
            taskId: current.id,
            privateAssetId: asset.id,
            claimedGameCount: 1,
          },
        });
        const complete = receivedImageCount >= current.requiredGameCount;
        await tx.disciplineResolutionTask.update({
          where: { id: current.id },
          data: {
            claimedGameCount: receivedImageCount,
            status: complete ? "PENDING_REVIEW" : "AWAITING_UPLOAD",
            submittedAt: complete ? new Date() : null,
          },
        });
        await tx.kakaoImageReceiveSession.updateMany({
          where: {
            targetType: "DisciplineResolutionTask",
            targetId: current.id,
            status: "ACTIVE",
          },
          data: {
            status: "CANCELLED",
          },
        });

        return { receivedImageCount, requiredGameCount: current.requiredGameCount, complete };
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
    const accessError = getAccessErrorResponseMessage(error, "경고 차감 사진을 등록하지 못했습니다.");
    if (accessError.status !== 500) return NextResponse.json({ message: accessError.message }, { status: accessError.status });
    if (error instanceof Error && ["TASK_NOT_UPLOADABLE", "TASK_ALREADY_COMPLETE"].includes(error.message)) {
      return NextResponse.json({ message: "다른 요청에서 사진 제출이 완료되었습니다. 화면을 새로고침해주세요." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TASK_DUPLICATE_IMAGE") {
      return NextResponse.json({ message: "이 인증에 이미 제출한 사진입니다. 다른 게임 사진을 선택해주세요." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TASK_EXPIRED") {
      return NextResponse.json({ message: "경고 차감 인증 기한이 지났습니다. 관리자에게 문의해주세요." }, { status: 409 });
    }
    if (isPublicImageError(error)) {
      return NextResponse.json({ message: (error as Error).message }, { status: 400 });
    }
    logServerError("[WEB_DISCIPLINE_EVIDENCE_UPLOAD_ERROR]", error);
    return NextResponse.json({ message: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
