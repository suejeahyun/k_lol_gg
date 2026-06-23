export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { EventMatchMode, Position } from "@prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type ParticipantInput = {
  playerId: number;
  position?: Position | null;
  balanceScore?: number;
};

const MAX_ADMIN_EVENT_MATCHES = 50;

function isValidMode(mode: string): mode is EventMatchMode {
  return mode === "POSITION" || mode === "ARAM";
}

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const events = await prisma.eventMatch.findMany({
      orderBy: {
        eventDate: "desc",
      },
      take: MAX_ADMIN_EVENT_MATCHES,
      include: {
        galleryImage: true,
        teams: {
          include: {
            members: {
              include: {
                player: true,
              },
            },
          },
        },
        participants: {
          include: {
            player: true,
          },
        },
        matches: {
          include: {
            teamA: true,
            teamB: true,
          },
        },
      },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("[EVENT_MATCHES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 목록 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await req.json();

    const title = String(body.title ?? "").trim();
    const mode = String(body.mode ?? "POSITION");

    const eventDate = body.eventDate ? new Date(body.eventDate) : null;

    const galleryImageId = body.galleryImageId
      ? Number(body.galleryImageId)
      : null;

    const participants: ParticipantInput[] = Array.isArray(body.participants)
      ? body.participants
      : [];

    if (!title) {
      return NextResponse.json(
        { message: "이벤트명을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!eventDate || Number.isNaN(eventDate.getTime())) {
      return NextResponse.json(
        { message: "진행일을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!isValidMode(mode)) {
      return NextResponse.json(
        { message: "이벤트 모드가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (participants.length > 0 && participants.length % 5 !== 0) {
      return NextResponse.json(
        { message: "참가자는 5명 단위로 등록해야 합니다." },
        { status: 400 }
      );
    }

    if (participants.length > 0 && participants.length < 10) {
      return NextResponse.json(
        { message: "이벤트 내전은 최소 10명 이상이어야 합니다." },
        { status: 400 }
      );
    }

    if (mode === "POSITION") {
      const hasEmptyPosition = participants.some(
        (participant) => !participant.position
      );

      if (hasEmptyPosition) {
        return NextResponse.json(
          { message: "포지션 모드에서는 모든 참가자의 라인이 필요합니다." },
          { status: 400 }
        );
      }
    }

    const duplicatedPlayerIds = participants
      .map((participant) => Number(participant.playerId))
      .filter((playerId, index, arr) => arr.indexOf(playerId) !== index);

    if (duplicatedPlayerIds.length > 0) {
      return NextResponse.json(
        { message: "중복된 참가자가 있습니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.create({
      data: {
        title,
        description: null,
        mode,
        status: "RECRUITING",
        eventDate,
        recruitFrom: null,
        recruitTo: null,
        galleryImageId,
        participants: {
          create: participants.map((participant) => ({
            playerId: Number(participant.playerId),
            position: mode === "ARAM" ? null : participant.position ?? null,
            balanceScore: Number(participant.balanceScore ?? 0),
          })),
        },
      },
      include: {
        galleryImage: true,
        participants: {
          include: {
            player: true,
          },
        },
        teams: true,
        matches: true,
      },
    });

    await prisma.adminLog.create({
      data: {
        action: "EVENT_MATCH_CREATE",
        message: `이벤트 내전 생성: ${event.title}`,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("[EVENT_MATCHES_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 생성 실패" },
      { status: 500 }
    );
  }
}
