import { NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}