export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = { params: Promise<{ tournamentId: string }> };

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function POST(_req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ message: "멸망전 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      include: {
        participants: { include: { player: true, team: true } },
        teams: true,
        matches: { select: { id: true } },
      },
    });

    if (!tournament) {
      return NextResponse.json({ message: "멸망전을 찾을 수 없습니다." }, { status: 404 });
    }

    if (tournament.matches.length > 0) {
      return NextResponse.json({ message: "경기가 생성된 이후에는 경매 추첨을 진행할 수 없습니다." }, { status: 400 });
    }

    const drawn = tournament.participants.find(
      (participant) => !participant.isCaptain && participant.auctionStatus === "DRAWN",
    );

    if (drawn) {
      return NextResponse.json(
        { message: "아직 낙찰/보류 처리되지 않은 추첨자가 있습니다.", participant: drawn },
        { status: 400 },
      );
    }

    const pendingPool = tournament.participants.filter(
      (participant) => !participant.isCaptain && participant.auctionStatus === "PENDING" && participant.teamId === null,
    );
    const holdPool = tournament.participants.filter(
      (participant) => !participant.isCaptain && participant.auctionStatus === "HOLD" && participant.teamId === null,
    );
    const pool = pendingPool.length > 0 ? pendingPool : holdPool;

    if (pool.length === 0) {
      return NextResponse.json({ message: "추첨 가능한 참가자가 없습니다." }, { status: 400 });
    }

    const selected = shuffle(pool)[0];
    const maxDrawOrder = tournament.participants.reduce((max, participant) => {
      return Math.max(max, participant.drawOrder ?? 0);
    }, 0);

    const updated = await prisma.destructionParticipant.update({
      where: { id: selected.id },
      data: {
        auctionStatus: "DRAWN",
        drawOrder: maxDrawOrder + 1,
      },
      include: { player: true, team: true },
    });

    await prisma.destructionTournament.update({
      where: { id },
      data: { status: "AUCTION" },
    });

    await prisma.adminLog.create({
      data: {
        action: "DESTRUCTION_AUCTION_DRAW",
        message: `멸망전 경매 추첨: ${tournament.title} / ${updated.player.nickname}#${updated.player.tag}`,
      },
    });

    return NextResponse.json({ participant: updated });
  } catch (error) {
    logServerError("[DESTRUCTION_AUCTION_DRAW_ERROR]", error);
    return NextResponse.json({ message: "경매 추첨 실패" }, { status: 500 });
  }
}

