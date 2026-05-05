import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";

export async function requireAdminRequest() {
  const cookieStore = await cookies();
  const legacyAdminToken = cookieStore.get(authConstants.ADMIN_TOKEN_KEY)?.value;

  if (legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE) {
    return { mode: "legacy-admin" as const };
  }

  const userToken = cookieStore.get("user_token")?.value;
  const payload = userToken ? verifyAuthToken(userToken) : null;

  if (payload?.role === "ADMIN") {
    return { mode: "user-admin" as const, user: payload };
  }

  return null;
}

export async function rejectIfNotAdmin() {
  const admin = await requireAdminRequest();

  if (!admin) {
    return NextResponse.json(
      { message: "관리자 권한이 필요합니다." },
      { status: 401 },
    );
  }

  return null;
}
