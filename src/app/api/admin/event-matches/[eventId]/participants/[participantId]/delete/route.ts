import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type Context = {
  params: Promise<{
    eventId: string;
    participantId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Context) {
  const { eventId, participantId } = await params;

  const parsedEventId = Number(eventId);
  const parsedParticipantId = Number(participantId);

  if (Number.isNaN(parsedEventId) || Number.isNaN(parsedParticipantId)) {
    return NextResponse.json(
      { message: "잘못된 요청입니다." },
      { status: 400 }
    );
  }

  await prisma.eventParticipant.deleteMany({
    where: {
      id: parsedParticipantId,
      eventId: parsedEventId,
    },
  });

  return NextResponse.redirect(
    new URL(`/admin/progress/event/${parsedEventId}`, req.url),
    303
  );
}