export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = { params: Promise<{ matchId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;
  try {
    const matchId = Number((await params).matchId);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (!Number.isInteger(matchId) || matchId <= 0 || body.method !== "ADMIN") {
      return NextResponse.json({ message: "경기 또는 선정 방식이 올바르지 않습니다." }, { status: 400 });
    }

    const match = await prisma.destructionMatch.findUnique({
      where: { id: matchId },
      include: {
        tournament: { include: { participants: { select: { playerId: true, teamId: true } } } },
      },
    });
    if (!match || !match.winnerTeamId) return NextResponse.json({ message: "결과가 등록된 멸망전 경기를 찾을 수 없습니다." }, { status: 404 });

    const mvpPlayerId = Number(body.mvpPlayerId);
    if (!Number.isInteger(mvpPlayerId) || mvpPlayerId <= 0) {
      return NextResponse.json({ message: "직접 지정할 MVP를 선택해주세요." }, { status: 400 });
    }

    const validCandidate = await prisma.destructionParticipant.findFirst({
      where: {
        tournamentId: match.tournamentId,
        teamId: { in: [match.teamAId, match.teamBId] },
        playerId: mvpPlayerId,
      },
      include: { player: true },
    });
    if (!validCandidate) return NextResponse.json({ message: "해당 경기 참가자 10명 중에서 MVP를 선정해주세요." }, { status: 400 });

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.destructionMatch.update({
        where: { id: matchId },
        data: { mvpPlayerId, mvpSelectionMethod: "ADMIN", mvpFinalizedAt: new Date(), mvpRevoteCandidateIds: [] },
      });
      await tx.adminLog.create({ data: { action: "DESTRUCTION_MATCH_MVP_UPDATE", message: `멸망전 ${match.stage} ${match.round}경기 MVP 관리자 지정: ${validCandidate.player.nickname}#${validCandidate.player.tag}` } });
      return next;
    });
    return NextResponse.json(updated);
  } catch (error) {
    logServerError("[DESTRUCTION_MATCH_MVP_ADMIN_ERROR]", error);
    return NextResponse.json({ message: "경기 MVP 확정에 실패했습니다." }, { status: 500 });
  }
}
