export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { extractMatchResultFromImage } from "@/lib/operation-ai/match-result-image-extractor";
import { buildMatchedMatchResult } from "@/lib/operation-ai/match-result-matcher";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

function isAllowedImageType(type: string) {
  return ["image/png", "image/jpeg", "image/webp"].includes(type);
}

export async function POST(req: Request) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const formData = await req.formData();
    const prompt = String(formData.get("prompt") ?? "");
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ message: "분석할 내전 결과 캡쳐 이미지를 첨부해주세요." }, { status: 400 });
    }

    if (!isAllowedImageType(image.type)) {
      return NextResponse.json({ message: "PNG, JPG, WEBP 이미지만 업로드할 수 있습니다." }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ message: "이미지는 최대 8MB까지 업로드할 수 있습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const extraction = await extractMatchResultFromImage({
      base64: buffer.toString("base64"),
      mimeType: image.type,
      prompt,
    });

    const matched = await buildMatchedMatchResult(extraction);
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "desc" },
    });

    const request = await prisma.operationAiRequest.create({
      data: {
        taskType: "MATCH_RESULT_IMAGE_ANALYZE",
        status: "PENDING",
        prompt: prompt || "내전 결과 캡쳐 이미지 분석",
        rawText: extraction.rawText ?? null,
        parsedJson: extraction as object,
        resultJson: matched as object,
      },
      select: { id: true },
    });

    return NextResponse.json({
      requestId: request.id,
      activeSeason,
      ...matched,
      notes: [
        "내전 결과 이미지는 오인식 가능성이 높습니다. 선수, 챔피언, K/D/A, 승리팀을 확인한 뒤 등록하세요.",
        "DB 매칭 후보가 없거나 10명이 아닌 세트는 직접 수정이 필요합니다.",
      ],
    });
  } catch (error) {
    console.error("[OPERATION_AI_MATCH_RESULT_IMAGE_ANALYZE_ERROR]", error);

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "내전 결과 이미지 분석 실패" },
      { status: 500 },
    );
  }
}
