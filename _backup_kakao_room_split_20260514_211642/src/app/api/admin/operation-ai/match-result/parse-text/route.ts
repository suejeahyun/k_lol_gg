export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { parseMatchResultText } from "@/lib/operation-ai/match-result-text-parser";
import { buildMatchedMatchResult } from "@/lib/operation-ai/match-result-matcher";

type Body = {
  text?: string;
  prompt?: string;
};

export async function POST(req: Request) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = (await req.json()) as Body;
    const text = String(body.text ?? "").trim();
    const prompt = String(body.prompt ?? "ChatGPT 분석 결과 붙여넣기").trim();

    if (!text) {
      return NextResponse.json({ message: "분석할 내전 결과 텍스트 또는 JSON을 입력해주세요." }, { status: 400 });
    }

    const extraction = parseMatchResultText(text);
    const matched = await buildMatchedMatchResult(extraction);
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "desc" },
    });

    const request = await prisma.operationAiRequest.create({
      data: {
        taskType: "MATCH_RESULT_TEXT_PARSE",
        status: "PENDING",
        prompt,
        rawText: text,
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
        "OpenAI API를 사용하지 않는 붙여넣기 분석 모드입니다.",
        "ChatGPT에서 추출한 JSON 또는 빠른 입력 텍스트를 기준으로 초안을 생성했습니다. 등록 전 반드시 확인하세요.",
      ],
    });
  } catch (error) {
    console.error("[OPERATION_AI_MATCH_RESULT_TEXT_PARSE_ERROR]", error);

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "내전 결과 텍스트 분석 실패" },
      { status: 500 },
    );
  }
}
