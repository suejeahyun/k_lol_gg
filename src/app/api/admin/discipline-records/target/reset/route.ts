export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  if (!text || text === "-" || text === "미입력") return null;
  return text;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetName = cleanText(body.targetName);
  const targetNickname = cleanText(body.targetNickname);
  const targetTag = cleanText(body.targetTag);

  if (!targetName) {
    return NextResponse.json({ message: "직접 등록 대상 초기화에는 이름이 필요합니다." }, { status: 400 });
  }

  const where: any = {
    isActive: true,
    userAccountId: null,
    playerId: null,
    targetName,
  };
  if (targetNickname) where.targetNickname = targetNickname;
  if (targetTag) where.targetTag = targetTag;

  const result = await prisma.userDisciplineRecord.updateMany({
    where,
    data: {
      isActive: false,
      resetAt: new Date(),
      resetReason: String(body.reason || "운영자 직접 입력 대상 누적 초기화"),
      resetBy: admin.user.userId,
    },
  });

  return NextResponse.json({ ok: true, count: result.count });
}
