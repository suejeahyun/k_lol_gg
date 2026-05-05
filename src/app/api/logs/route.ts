import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const logs = await prisma.adminLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      select: {
        id: true,
        type: true,
        message: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      logs.map((log) => ({
        id: log.id,
        type: log.type,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("[LOGS_GET_ERROR]", error);

    return NextResponse.json(
      {
        message: "로그 목록 조회에 실패했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const type = String(body.type ?? body.action ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!type || !message) {
      return NextResponse.json(
        {
          message: "로그 타입과 메시지는 필수입니다.",
        },
        {
          status: 400,
        }
      );
    }

    const log = await prisma.adminLog.create({
      data: {
        type,
        message,
      },
      select: {
        id: true,
        type: true,
        message: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        id: log.id,
        type: log.type,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("[LOGS_POST_ERROR]", error);

    return NextResponse.json(
      {
        message: "로그 저장에 실패했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}