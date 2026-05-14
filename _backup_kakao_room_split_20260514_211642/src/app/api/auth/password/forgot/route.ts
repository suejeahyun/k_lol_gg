export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { rejectIfRateLimited } from "@/lib/rate-limit";

export async function PATCH(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "PASSWORD_FORGOT_REQUEST",
    limit: 5,
    windowSeconds: 1800,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const body = await req.json();
    const userId = String(body.userId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const nickname = String(body.nickname ?? "").trim();
    const tag = String(body.tag ?? "").replace(/^#/, "").trim();

    await writeAdminLog({
      action: "USER_PASSWORD_RESET_REQUEST_BLOCKED",
      message: userId
        ? `비밀번호 찾기 직접 재설정 차단: ${userId}`
        : "비밀번호 찾기 직접 재설정 차단: 아이디 미입력",
      targetType: "UserAccount",
      actorUserId: userId || null,
      afterJson: {
        userId: userId || null,
        name: name || null,
        nickname: nickname || null,
        tag: tag || null,
        policy: "ADMIN_RESET_REQUIRED",
      },
      ...getRequestAuditFields(req),
    });

    return NextResponse.json(
      {
        message:
          "보안 정책상 비밀번호 찾기에서 직접 재설정할 수 없습니다. 관리자에게 비밀번호 초기화를 요청해주세요.",
        code: "ADMIN_RESET_REQUIRED",
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("[AUTH_PASSWORD_FORGOT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "비밀번호 초기화 요청 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
