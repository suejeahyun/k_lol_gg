export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import { extractParticipationTextFromImage } from "@/lib/operation-ai/image-text-extractor";
import { parseParticipationText } from "@/lib/operation-ai/participation-parser";
import { matchPlayersByNames } from "@/lib/operation-ai/player-matcher";

const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxImageSize = 8 * 1024 * 1024;

async function fileToBase64(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const formData = await req.formData();
    const prompt = String(formData.get("prompt") || "참가 신청 캡쳐 이미지 자동 인식").trim();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ message: "분석할 이미지 파일을 업로드해주세요." }, { status: 400 });
    }

    if (!allowedMimeTypes.has(image.type)) {
      return NextResponse.json(
        { message: "PNG, JPG, WEBP 이미지만 분석할 수 있습니다." },
        { status: 400 },
      );
    }

    if (image.size > maxImageSize) {
      return NextResponse.json(
        { message: "이미지 용량은 8MB 이하만 허용됩니다." },
        { status: 400 },
      );
    }

    const base64 = await fileToBase64(image);
    const extraction = await extractParticipationTextFromImage({
      base64,
      mimeType: image.type,
      prompt,
    });

    const rows = parseParticipationText(extraction.extractedText);
    const candidatesByName = await matchPlayersByNames(rows.map((row) => row.name));

    const enrichedRows = rows.map((row) => {
      const candidates = candidatesByName[row.name] ?? [];
      const exactCandidate = candidates.find((candidate) => candidate.score >= 96) ?? null;
      const warnings = [...row.warnings, "이미지 캡쳐에서 인식된 값입니다. 원문과 대조가 필요합니다."];

      if (!exactCandidate) {
        warnings.push("DB 플레이어 자동 확정이 필요합니다.");
      }

      return {
        ...row,
        selectedPlayerId: exactCandidate?.id ?? null,
        candidates,
        warnings,
      };
    });

    const request = await prisma.operationAiRequest.create({
      data: {
        taskType: "PARTICIPATION_IMAGE_PARSE",
        status: enrichedRows.length > 0 ? "PENDING" : "FAILED",
        prompt,
        rawText: extraction.extractedText,
        parsedJson: {
          source: "IMAGE",
          file: {
            name: image.name,
            type: image.type,
            size: image.size,
          },
          extractedText: extraction.extractedText,
          notes: extraction.notes,
          rows: enrichedRows,
          total: enrichedRows.length,
        } as Prisma.InputJsonValue,
        errorMessage: enrichedRows.length > 0 ? null : "참가 신청 양식으로 인식된 줄이 없습니다.",
        createdByUserId: admin.user.userId,
      },
      select: { id: true },
    });

    await writeAdminLog({
      action: "OPERATION_AI_PARTICIPATION_IMAGE_PARSE",
      message: `운영 AI 참가 신청 이미지 분석: 요청 #${request.id}, ${enrichedRows.length}명 인식`,
      actorId: admin.user.id,
      actorType: admin.mode,
      actorUserId: admin.user.userId,
      targetType: "OperationAiRequest",
      targetId: request.id,
      afterJson: {
        fileName: image.name,
        fileType: image.type,
        fileSize: image.size,
        total: enrichedRows.length,
      } as Prisma.InputJsonValue,
    });

    return NextResponse.json({
      requestId: request.id,
      total: enrichedRows.length,
      extractedText: extraction.extractedText,
      notes: extraction.notes,
      rows: enrichedRows,
    });
  } catch (error: unknown) {
    console.error("[OPERATION_AI_PARTICIPATION_IMAGE_PARSE_ERROR]", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "참가 신청 이미지 분석 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
