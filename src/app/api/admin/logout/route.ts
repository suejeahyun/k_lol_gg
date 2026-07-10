import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { authConstants } from "@/lib/auth";
import { USER_TOKEN_COOKIE, clearAuthCookieOptions } from "@/lib/auth/cookies";

export async function POST() {
  await writeAdminLog({
    action: "ADMIN_LOGOUT",
    message: "관리자 로그아웃",
  });

  const response = NextResponse.json({ success: true });

  response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", clearAuthCookieOptions());
  response.cookies.set(USER_TOKEN_COOKIE, "", clearAuthCookieOptions());

  return response;
}
