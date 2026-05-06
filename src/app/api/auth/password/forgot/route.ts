import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { writeAdminLog } from "@/lib/admin-log";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = String(body.userId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const nickname = String(body.nickname ?? "").trim();
    const tag = String(body.tag ?? "").replace(/^#/, "").trim();
    const newPassword = String(body.newPassword ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!userId || !name || !nickname || !tag || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { message: "아이디, 이름, 닉네임, 태그, 새 비밀번호를 모두 입력해주세요." },
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

    const user = await prisma.userAccount.findUnique({
      where: { userId },
      include: { player: true },
    });

    if (
      !user ||
      !user.player ||
      user.player.name !== name ||
      user.player.nickname !== nickname ||
      user.player.tag !== tag
    ) {
      return NextResponse.json(
        { message: "입력한 계정 정보와 플레이어 정보가 일치하지 않습니다." },
        { status: 404 },
      );
    }

    if (user.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { message: "최고 관리자 계정은 관리자 페이지에서만 초기화할 수 있습니다." },
        { status: 403 },
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.userAccount.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await writeAdminLog({
      action: "USER_PASSWORD_FORGOT_RESET",
      message: `비밀번호 찾기 재설정: #${user.id} ${user.userId}`,
    });

    return NextResponse.json({
      message: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.",
    });
  } catch (error) {
    console.error("[AUTH_PASSWORD_FORGOT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "비밀번호 재설정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
