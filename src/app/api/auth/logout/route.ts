import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";

export async function POST() {
  await writeAdminLog({
    action: "USER_LOGOUT",
    message: "유저 로그아웃",
  });

  const res = NextResponse.json({
    message: "로그아웃되었습니다.",
  });

  res.cookies.set("user_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return res;
}
