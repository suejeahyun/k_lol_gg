export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import { parseParticipationText } from "@/lib/operation-ai/participation-parser";
import { matchPlayersByNames } from "@/lib/operation-ai/player-matcher";

type ParseBody = {
  text?: string;
  prompt?: string;
};

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const body = (await req.json()) as ParseBody;
    const text = String(body.text || "").trim();
    const prompt = String(body.prompt || "시즌 내전 참가 신청 자동 인식").trim();

    if (!text) {
      return NextResponse.json({ message: "분석할 참가 신청 글을 입력해주세요." }, { status: 400 });
    }

    const rows = parseParticipationText(text);
    const candidatesByName = await matchPlayersByNames(rows.map((row) => row.name));

    const enrichedRows = rows.map((row) => {
      const candidates = candidatesByName[row.name] ?? [];
      const exactCandidate = candidates.find((candidate) => candidate.score >= 96) ?? null;
      const warnings = [...row.warnings];

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
        taskType: "PARTICIPATION_PARSE",
        status: "PENDING",
        prompt,
        rawText: text,
        parsedJson: {
          rows: enrichedRows,
          total: enrichedRows.length,
        } as Prisma.InputJsonValue,
        createdByUserId: admin.user.userId,
      },
      select: {
        id: true,
      },
    });

    await writeAdminLog({
      action: "OPERATION_AI_PARTICIPATION_PARSE",
      message: `운영 AI 참가 신청 분석: 요청 #${request.id}, ${enrichedRows.length}명 인식`,
      actorId: admin.user.id,
      actorType: admin.mode,
      actorUserId: admin.user.userId,
      targetType: "OperationAiRequest",
      targetId: request.id,
      afterJson: { total: enrichedRows.length } as Prisma.InputJsonValue,
    });

    return NextResponse.json({
      requestId: request.id,
      total: enrichedRows.length,
      rows: enrichedRows,
    });
  } catch (error: unknown) {
    console.error("[OPERATION_AI_PARTICIPATION_PARSE_ERROR]", error);

    return NextResponse.json(
      { message: "참가 신청 글 분석 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
