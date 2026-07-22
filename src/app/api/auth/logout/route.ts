import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { authConstants } from "@/lib/auth";
import { USER_TOKEN_COOKIE, clearAuthCookieOptions } from "@/lib/auth/cookies";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    await writeAdminLog({
      action: "USER_LOGOUT",
      message: `유저 로그아웃: #${user.userAccountId} ${user.userId}`,
      actorId: user.userAccountId,
      actorType: user.role,
      actorUserId: user.userId,
      targetType: "UserAccount",
      targetId: user.userAccountId,
    });
  }

  const res = NextResponse.json({
    message: "로그아웃되었습니다.",
  });

  res.cookies.set(USER_TOKEN_COOKIE, "", clearAuthCookieOptions());
  res.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", clearAuthCookieOptions());

  return res;
}
