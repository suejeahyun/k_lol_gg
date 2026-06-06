export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getApprovedUserOrResponse } from "@/lib/community/auth";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;

  const body = await req.json();
  const gameId = Number(body.gameId);
  const playerId = Number(body.playerId);
  if (!Number.isInteger(gameId) || gameId <= 0 || !Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ message: "투표 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const game = await prisma.matchGame.findUnique({
    where: { id: gameId },
    include: {
      series: true,
      participants: { include: { player: true } },
    },
  });
  if (!game) return NextResponse.json({ message: "세트를 찾을 수 없습니다." }, { status: 404 });
  if (Date.now() - new Date(game.series.createdAt).getTime() > ONE_DAY_MS) {
    return NextResponse.json({ message: "MVP 투표 기간이 종료되었습니다." }, { status: 403 });
  }

  const voterPlayerId = user!.playerId;
  const isParticipant = Boolean(voterPlayerId && game.participants.some((p) => p.playerId === voterPlayerId));
  if (!isParticipant) return NextResponse.json({ message: "해당 매치 참가자만 투표할 수 있습니다." }, { status: 403 });
  const isCandidate = game.participants.some((p) => p.playerId === playerId);
  if (!isCandidate) return NextResponse.json({ message: "해당 매치 참가자에게만 투표할 수 있습니다." }, { status: 400 });

  const vote = await prisma.matchMvpVote.upsert({
    where: { gameId_voterId: { gameId, voterId: user!.userAccountId } },
    update: { playerId },
    create: { gameId, voterId: user!.userAccountId, playerId },
  });
  return NextResponse.json({ vote });
}
