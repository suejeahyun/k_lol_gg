import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type RealPosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

function toRealPosition(position: string | null): RealPosition {
  if (
    position === "TOP" ||
    position === "JGL" ||
    position === "MID" ||
    position === "ADC" ||
    position === "SUP"
  ) {
    return position;
  }

  return "TOP";
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 }
      );
    }

    const applies = await prisma.destructionParticipationApply.findMany({
      where: {
        tournamentId: id,
        status: "APPLIED",
      },
      select: {
        playerId: true,
        mainPosition: true,
      },
    });

    if (applies.length === 0) {
      return NextResponse.json({
        message: "가져올 참가 신청자가 없습니다.",
        count: 0,
      });
    }

    await prisma.$transaction(
      applies.map((apply) =>
        prisma.destructionParticipant.upsert({
          where: {
            tournamentId_playerId: {
              tournamentId: id,
              playerId: apply.playerId,
            },
          },
          update: {
            position: toRealPosition(apply.mainPosition),
          },
          create: {
            tournamentId: id,
            playerId: apply.playerId,
            position: toRealPosition(apply.mainPosition),
          },
        })
      )
    );

    return NextResponse.json({
      message: "멸망전 참가자 가져오기가 완료되었습니다.",
      count: applies.length,
    });
  } catch (error: unknown) {
    console.error("[ADMIN_DESTRUCTION_IMPORT_PARTICIPANTS_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가자 가져오기 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}