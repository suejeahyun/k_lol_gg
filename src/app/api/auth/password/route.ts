export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { writeAdminLog } from "@/lib/admin-log";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getCurrentUser();

    if (!session) {
      return NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." },
        { status: 400 },
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { message: "새 비밀번호 확인이 일치하지 않습니다." },
        { status: 400 },
      );
    }

    if (newPassword.length < 8 || newPassword.length > 32) {
      return NextResponse.json(
        { message: "새 비밀번호는 8~32자로 입력해주세요." },
        { status: 400 },
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { message: "새 비밀번호는 현재 비밀번호와 달라야 합니다." },
        { status: 400 },
      );
    }

    const user = await prisma.userAccount.findUnique({
      where: { id: session.userAccountId },
    });

    if (!user) {
      return NextResponse.json(
        { message: "사용자를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { message: "현재 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.userAccount.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await writeAdminLog({
      action: "USER_PASSWORD_CHANGE",
      message: `비밀번호 변경: #${user.id} ${user.userId}`,
    });

    return NextResponse.json({
      message: "비밀번호가 변경되었습니다. 다시 로그인해주세요.",
    });
  } catch (error) {
    console.error("[AUTH_PASSWORD_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "비밀번호 변경 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
