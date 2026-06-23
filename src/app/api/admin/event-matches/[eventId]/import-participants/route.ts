export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

const MAX_IMPORT_PARTICIPANTS = 100;

type RealPosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

function toRealPosition(position: string | null): RealPosition | null {
  if (
    position === "TOP" ||
    position === "JGL" ||
    position === "MID" ||
    position === "ADC" ||
    position === "SUP"
  ) {
    return position;
  }

  return null;
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const id = Number(eventId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 이벤트 ID입니다." },
        { status: 400 }
      );
    }

    const applies = await prisma.eventParticipationApply.findMany({
      where: {
        eventId: id,
        status: "APPLIED",
      },
      orderBy: { id: "asc" },
      take: MAX_IMPORT_PARTICIPANTS + 1,
      select: {
        playerId: true,
        mainPosition: true,
      },
    });

    if (applies.length > MAX_IMPORT_PARTICIPANTS) {
      return NextResponse.json(
        { message: `한 번에 가져올 수 있는 참가자는 최대 ${MAX_IMPORT_PARTICIPANTS}명입니다.` },
        { status: 400 },
      );
    }

    if (applies.length === 0) {
      return NextResponse.json({
        message: "가져올 참가 신청자가 없습니다.",
        count: 0,
      });
    }

    await prisma.$transaction([
      ...applies.map((apply) =>
        prisma.eventParticipant.upsert({
          where: {
            eventId_playerId: {
              eventId: id,
              playerId: apply.playerId,
            },
          },
          update: {
            position: toRealPosition(apply.mainPosition),
          },
          create: {
            eventId: id,
            playerId: apply.playerId,
            position: toRealPosition(apply.mainPosition),
          },
        })
      ),
      prisma.eventParticipationApply.updateMany({
        where: {
          eventId: id,
          playerId: {
            in: applies.map((apply) => apply.playerId),
          },
        },
        data: {
          status: "CONFIRMED",
        },
      }),
      prisma.adminLog.create({
        data: {
          action: "EVENT_PARTICIPANTS_IMPORT",
          message: `이벤트 내전 참가자 가져오기: 이벤트 #${id}, ${applies.length}명`,
        },
      }),
    ]);

    return NextResponse.json({
      message: "이벤트 내전 참가자 가져오기가 완료되었습니다.",
      count: applies.length,
    });
  } catch (error: unknown) {
    logServerError("ADMIN_EVENT_IMPORT_PARTICIPANTS_ERROR", error);

    return NextResponse.json(
      { message: "이벤트 내전 참가자 가져오기 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
