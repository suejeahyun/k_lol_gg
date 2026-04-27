import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    // 현재 활성 시즌
    const season = await prisma.season.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
    });

    // 최신 이벤트 내전 (최근 생성 기준)
    const event = await prisma.eventMatch.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
    });

    // 최신 멸망전
    const destruction = await prisma.destructionTournament.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      season: season
        ? {
            id: season.id,
            name: season.name,
          }
        : null,

      event: event
        ? {
            id: event.id,
            title: event.title,
            status: event.status,
          }
        : null,

      destruction: destruction
        ? {
            id: destruction.id,
            title: destruction.title,
            status: destruction.status,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error("[PARTICIPATION_GET_ERROR]", error);

    return NextResponse.json(
      { message: "참가 정보 조회 중 오류 발생" },
      { status: 500 }
    );
  }
}