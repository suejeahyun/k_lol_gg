
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{
    tournamentId: string;
  }>;
};

const MAX_IMPORT_PARTICIPANTS = 200;

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
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 },
      );
    }

    const applies = await prisma.destructionParticipationApply.findMany({
      where: {
        tournamentId: id,
        status: {
          in: ["APPLIED", "CONFIRMED"],
        },
      },
      orderBy: { id: "asc" },
      take: MAX_IMPORT_PARTICIPANTS + 1,
      select: {
        playerId: true,
        mainPosition: true,
        isCaptain: true,
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

    const invalid = applies.find((apply) => !toRealPosition(apply.mainPosition));
    if (invalid) {
      return NextResponse.json(
        { message: "모든 신청자는 TOP/JGL/MID/ADC/SUP 중 하나의 주 포지션이 필요합니다." },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      ...applies.map((apply) =>
        prisma.destructionParticipant.upsert({
          where: {
            tournamentId_playerId: {
              tournamentId: id,
              playerId: apply.playerId,
            },
          },
          update: {
            position: toRealPosition(apply.mainPosition) ?? "TOP",
            isCaptain: false,
            auctionStatus: "PENDING",
            teamId: null,
          },
          create: {
            tournamentId: id,
            playerId: apply.playerId,
            position: toRealPosition(apply.mainPosition) ?? "TOP",
            isCaptain: false,
            auctionStatus: "PENDING",
          },
        }),
      ),
      prisma.destructionParticipationApply.updateMany({
        where: {
          tournamentId: id,
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
          action: "DESTRUCTION_PARTICIPANTS_IMPORT",
          message: `멸망전 참가자 가져오기: 멸망전 #${id}, ${applies.length}명`,
        },
      }),
    ]);

    return NextResponse.json({
      message: "멸망전 참가자 가져오기가 완료되었습니다.",
      count: applies.length,
    });
  } catch (error: unknown) {
    logServerError("ADMIN_DESTRUCTION_IMPORT_PARTICIPANTS_ERROR", error);

    return NextResponse.json(
      { message: "멸망전 참가자 가져오기 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
