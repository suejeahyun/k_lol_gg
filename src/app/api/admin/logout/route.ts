import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { authConstants } from "@/lib/auth";

export async function POST() {
  await writeAdminLog({
    action: "ADMIN_LOGOUT",
    message: "관리자 로그아웃",
  });

  const response = NextResponse.json({ success: true });

  response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("user_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
