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
      { status: 400 }
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
    303
  );
}
