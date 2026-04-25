import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreateAdminLogBody = {
  action?: string;
  message?: string;
};

export async function GET() {
  try {
    const logs = await prisma.adminLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("[ADMIN_LOG_GET_ERROR]", error);

    return NextResponse.json(
      { message: "로그 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateAdminLogBody;

    const action = String(body.action ?? "ADMIN_ACTION").trim();
    const message = String(body.message ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { message: "로그 메시지는 필수입니다." },
        { status: 400 }
      );
    }

    const log = await prisma.adminLog.create({
      data: {
        action,
        message,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("[ADMIN_LOG_CREATE_ERROR]", error);

    return NextResponse.json(
      { message: "로그 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}