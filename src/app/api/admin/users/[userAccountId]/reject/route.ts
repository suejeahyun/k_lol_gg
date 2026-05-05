import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type RouteContext = {
  params: Promise<{
    userAccountId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? "").trim();

    const { userAccountId } = await params;
    const id = Number(userAccountId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 유저 ID입니다." },
        { status: 400 }
      );
    }

    const user = await prisma.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { message: "유저를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.userAccount.update({
      where: { id },
      data: {
        status: "REJECTED",
      },
    });

    await writeAdminLog({
      action: "USER_REJECT",
      message: `회원 거절: #${id} ${user.userId}${reason ? ` / 사유: ${reason}` : ""}`,
    });

    return NextResponse.json({
      message: "회원이 거절 처리되었습니다.",
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
        if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
            { message: "로그인이 필요합니다." },
            { status: 401 }
        );
        }

        if (error.message === "FORBIDDEN") {
        return NextResponse.json(
            { message: "관리자 권한이 필요합니다." },
            { status: 403 }
        );
        }
    }

    console.error("[ERROR]", error);

    return NextResponse.json(
        { message: "오류 발생" },
        { status: 500 }
    );
    }
}