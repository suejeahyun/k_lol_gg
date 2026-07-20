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
    const body = await req.json();
    const method = body.method === "VOTE" ? "VOTE" : body.method === "ADMIN" ? "ADMIN" : null;
    if (!Number.isInteger(matchId) || !method) return NextResponse.json({ message: "경기 또는 선정 방식이 올바르지 않습니다." }, { status: 400 });

    const match = await prisma.destructionMatch.findUnique({
      where: { id: matchId },
      include: {
        tournament: { include: { participants: { select: { playerId: true, teamId: true } } } },
        mvpVotes: true,
      },
    });
    if (!match || !match.winnerTeamId) return NextResponse.json({ message: "결과가 등록된 멸망전 경기를 찾을 수 없습니다." }, { status: 404 });

    let mvpPlayerId: number;
    if (method === "ADMIN") {
      mvpPlayerId = Number(body.mvpPlayerId);
      if (!Number.isInteger(mvpPlayerId)) return NextResponse.json({ message: "직접 지정할 MVP를 선택해주세요." }, { status: 400 });
    } else {
      if (!match.mvpVotes.length) return NextResponse.json({ message: "확정할 MVP 투표가 없습니다." }, { status: 400 });
      const counts = new Map<number, number>();
      for (const vote of match.mvpVotes) counts.set(vote.candidatePlayerId, (counts.get(vote.candidatePlayerId) ?? 0) + 1);
      const highest = Math.max(...counts.values());
      const leaders = [...counts].filter(([, count]) => count === highest).map(([playerId]) => playerId);
      if (leaders.length !== 1) return NextResponse.json({ message: "공동 1위입니다. 관리자가 MVP를 직접 지정해주세요." }, { status: 409 });
      mvpPlayerId = leaders[0];
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
      const next = await tx.destructionMatch.update({ where: { id: matchId }, data: { mvpPlayerId, mvpSelectionMethod: method, mvpFinalizedAt: new Date() } });
      await tx.adminLog.create({ data: { action: "DESTRUCTION_MATCH_MVP_UPDATE", message: `멸망전 ${match.stage} ${match.round}경기 MVP ${method === "VOTE" ? "투표 확정" : "관리자 지정"}: ${validCandidate.player.nickname}#${validCandidate.player.tag}` } });
      return next;
    });
    return NextResponse.json(updated);
  } catch (error) {
    logServerError("[DESTRUCTION_MATCH_MVP_ADMIN_ERROR]", error);
    return NextResponse.json({ message: "경기 MVP 확정에 실패했습니다." }, { status: 500 });
  }
}
