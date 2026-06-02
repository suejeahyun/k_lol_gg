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

async function recalculateEventTeamScore(teamId: number) {
  const members = await prisma.eventParticipant.findMany({
    where: { teamId },
    select: { balanceScore: true },
  });

  const score = members.reduce((sum, member) => sum + member.balanceScore, 0);

  await prisma.eventTeam.update({
    where: { id: teamId },
    data: { score: Math.round(score * 100) / 100 },
  });
}

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

  if (event.matches.length > 0) {
    return NextResponse.json(
      { message: "이미 대진표가 생성된 이벤트는 참가자를 삭제할 수 없습니다." },
      { status: 400 },
    );
  }

  const hasSubmittedMatchResult = event.matches.some(
    (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
  );

  if (hasSubmittedMatchResult) {
    return NextResponse.json(
      { message: "이미 결과가 저장된 이벤트는 참가자를 삭제할 수 없습니다." },
      { status: 400 },
    );
  }

  const participant = await prisma.eventParticipant.findFirst({
    where: {
      id: parsedParticipantId,
      eventId: parsedEventId,
    },
    select: {
      id: true,
      teamId: true,
    },
  });

  if (!participant) {
    return NextResponse.redirect(
      new URL(`/admin/progress/event/${parsedEventId}`, req.url),
      303,
    );
  }

  await prisma.eventParticipant.delete({
    where: {
      id: participant.id,
    },
  });

  if (participant.teamId) {
    await recalculateEventTeamScore(participant.teamId);
  }

  await writeAdminLog({
    action: "EVENT_PARTICIPANT_DELETE",
    message: `이벤트 참가자 삭제: 이벤트 #${parsedEventId}, 참가자 #${parsedParticipantId}`,
  });

  return NextResponse.redirect(
    new URL(`/admin/progress/event/${parsedEventId}`, req.url),
    303,
  );
}
