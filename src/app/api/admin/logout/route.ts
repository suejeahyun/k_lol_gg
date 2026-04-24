import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const logs = await prisma.adminLog.findMany({
      orderBy: {
        createdAt: "desc",
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
        message: "로그 목록을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}