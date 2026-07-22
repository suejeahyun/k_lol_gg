import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma/client";

export async function PATCH(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "PASSWORD_FORGOT_REQUEST",
    limit: 5,
    windowSeconds: 1800,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const userId = String(body.userId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const nickname = String(body.nickname ?? "").trim();
    const tag = String(body.tag ?? "").replace(/^#/, "").trim();

    if (!userId || !name || !nickname || !tag) {
      return NextResponse.json(
        { message: "아이디, 이름, 닉네임, 태그를 모두 입력해주세요." },
        { status: 400 },
      );
    }

    if (userId.length > 32 || name.length > 50 || nickname.length > 100 || tag.length > 30) {
      return NextResponse.json(
        { message: "입력값이 허용 길이를 초과했습니다." },
        { status: 400 },
      );
    }

    const matchingAccount = await prisma.userAccount.findFirst({
      where: {
        userId,
        deletedAt: null,
        player: {
          is: { name, nickname, tag },
        },
      },
      select: { id: true, userId: true },
    });

    if (matchingAccount) {
      await writeAdminLog({
        action: "USER_PASSWORD_RESET_REQUESTED",
        message: `비밀번호 초기화 요청: ${matchingAccount.userId}`,
        actorType: "PUBLIC_PASSWORD_RECOVERY",
        actorUserId: matchingAccount.userId,
        targetType: "UserAccount",
        targetId: matchingAccount.id,
        afterJson: {
          policy: "ADMIN_RESET_REQUIRED",
          identityMatched: true,
        },
        ...getRequestAuditFields(req),
      });
    }

    return NextResponse.json(
      {
        message:
          "비밀번호 초기화 요청이 기록되었습니다. 관리자 확인 후 임시 비밀번호를 안내받아주세요.",
        code: "ADMIN_RESET_REQUIRED",
      },
      { status: 202 },
    );
  } catch (error) {
    logServerError("[AUTH_PASSWORD_FORGOT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "비밀번호 초기화 요청 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

