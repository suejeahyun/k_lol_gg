export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const [season, event, destruction] = await Promise.all([
      prisma.season.findFirst({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.eventMatch.findFirst({
        where: {
          status: "RECRUITING",
        },
        orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          eventDate: true,
        },
      }),
      prisma.destructionTournament.findFirst({
        where: {
          status: "RECRUITING",
        },
        orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          startDate: true,
        },
      }),
    ]);

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
            eventDate: event.eventDate,
          }
        : null,
      destruction: destruction
        ? {
            id: destruction.id,
            title: destruction.title,
            status: destruction.status,
            startDate: destruction.startDate,
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
