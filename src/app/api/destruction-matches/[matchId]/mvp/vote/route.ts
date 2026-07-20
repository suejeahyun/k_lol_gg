export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = { params: Promise<{ matchId: string }> };

export async function PUT(req: NextRequest, { params }: RouteProps) {
  try {
    const user = await requireApprovedUser();
    const matchId = Number((await params).matchId);
    const candidatePlayerId = Number((await req.json()).candidatePlayerId);
    if (!Number.isInteger(matchId) || !Number.isInteger(candidatePlayerId)) return NextResponse.json({ message: "경기 또는 MVP 후보가 올바르지 않습니다." }, { status: 400 });

    const match = await prisma.destructionMatch.findUnique({
      where: { id: matchId },
      include: {
        tournament: {
          include: {
            participants: { select: { playerId: true, teamId: true } },
          },
        },
      },
    });
    if (!match || !match.winnerTeamId) return NextResponse.json({ message: "결과가 등록된 멸망전 경기를 찾을 수 없습니다." }, { status: 404 });
    if (match.mvpFinalizedAt) return NextResponse.json({ message: "이미 MVP가 확정된 경기입니다." }, { status: 409 });

    const matchParticipants = match.tournament.participants.filter(
      (participant) => participant.teamId === match.teamAId || participant.teamId === match.teamBId,
    );
    if (matchParticipants.length !== 10) return NextResponse.json({ message: "경기 참가자 10명이 확정되어야 투표할 수 있습니다." }, { status: 409 });
    if (!user.playerId || !matchParticipants.some((participant) => participant.playerId === user.playerId)) {
      return NextResponse.json({ message: "해당 경기 참가자 10명만 투표할 수 있습니다." }, { status: 403 });
    }
    if (candidatePlayerId === user.playerId) return NextResponse.json({ message: "본인에게는 투표할 수 없습니다." }, { status: 400 });
    if (!matchParticipants.some((participant) => participant.playerId === candidatePlayerId)) {
      return NextResponse.json({ message: "해당 경기 참가자에게만 투표할 수 있습니다." }, { status: 400 });
    }

    const vote = await prisma.destructionMatchMvpVote.upsert({
      where: { matchId_voterUserAccountId: { matchId, voterUserAccountId: user.userAccountId } },
      create: { matchId, voterUserAccountId: user.userAccountId, candidatePlayerId },
      update: { candidatePlayerId },
    });
    return NextResponse.json({ vote });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ message: "로그인 후 투표할 수 있습니다." }, { status: 401 });
    if (error instanceof Error && error.message === "NOT_APPROVED") return NextResponse.json({ message: "승인된 회원만 투표할 수 있습니다." }, { status: 403 });
    logServerError("[DESTRUCTION_MATCH_MVP_VOTE_ERROR]", error);
    return NextResponse.json({ message: "MVP 투표 저장에 실패했습니다." }, { status: 500 });
  }
}
