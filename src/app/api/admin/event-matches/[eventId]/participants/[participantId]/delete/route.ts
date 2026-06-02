export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type Context = {
  params: Promise<{
    eventId: string;
    participantId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Context) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const { eventId, participantId } = await params;

  const parsedEventId = Number(eventId);
  const parsedParticipantId = Number(participantId);

  if (Number.isNaN(parsedEventId) || Number.isNaN(parsedParticipantId)) {
    return NextResponse.json(
      { message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const event = await prisma.eventMatch.findUnique({
    where: { id: parsedEventId },
    include: {
      teams: {
        select: {
          id: true,
        },
      },
      matches: {
        select: {
          id: true,
          winnerTeamId: true,
          mvpPlayerId: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json(
      { message: "이벤트 내전을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const hasSubmittedMatchResult = event.matches.some(
    (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
  );

  if (event.teams.length > 0 || hasSubmittedMatchResult) {
    return NextResponse.json(
      { message: "팀 생성 또는 결과 저장 후에는 참가자를 삭제할 수 없습니다." },
      { status: 400 },
    );
  }

  const deleted = await prisma.eventParticipant.deleteMany({
    where: {
      id: parsedParticipantId,
      eventId: parsedEventId,
    },
  });

  if (deleted.count > 0) {
    await writeAdminLog({
      action: "EVENT_PARTICIPANT_DELETE",
      message: `이벤트 참가자 삭제: 이벤트 #${parsedEventId}, 참가자 #${parsedParticipantId}`,
    });
  }

  return NextResponse.redirect(
    new URL(`/admin/progress/event/${parsedEventId}`, req.url),
    303,
  );
}
