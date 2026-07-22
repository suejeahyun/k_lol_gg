import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { authConstants } from "@/lib/auth";
import { USER_TOKEN_COOKIE, clearAuthCookieOptions } from "@/lib/auth/cookies";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

export async function POST() {
  const admin = await requireAdminRequest().catch(() => null);
  if (admin) {
    await writeAdminLog({
      action: "ADMIN_LOGOUT",
      message: `관리자 로그아웃: ${admin.user.userId}`,
      actorId: admin.user.id,
      actorType: admin.user.role,
      actorUserId: admin.user.userId,
      targetType: "UserAccount",
      targetId: admin.user.id,
    });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", clearAuthCookieOptions());
  response.cookies.set(USER_TOKEN_COOKIE, "", clearAuthCookieOptions());

  return response;
}
