import { NextResponse } from "next/server";
import { getCurrentUser, requireAdmin, requireApprovedUser } from "@/lib/auth/session";

export async function getApprovedUserOrResponse() {
  try {
    const user = await requireApprovedUser();
    return { user, response: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    if (message === "NOT_APPROVED") {
      return {
        user: null,
        response: NextResponse.json({ message: "승인 완료 유저만 사용할 수 있습니다." }, { status: 403 }),
      };
    }
    return {
      user: null,
      response: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }),
    };
  }
}

export async function getAdminOrResponse() {
  try {
    const user = await requireAdmin();
    return { user, response: null };
  } catch {
    return {
      user: null,
      response: NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }
}

export async function getOptionalCurrentUserId() {
  const user = await getCurrentUser();
  return user?.userAccountId ?? null;
}
