export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";
import { logServerError } from "@/lib/server/safe-log";
import { resolveMvpVotes } from "@/lib/destruction/mvp-voting";

type RouteProps = { params: Promise<{ matchId: string }> };

export async function PUT(req: NextRequest, { params }: RouteProps) {
  try {
    const user = await requireApprovedUser();
    const matchId = Number((await params).matchId);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const candidatePlayerId = Number(body.candidatePlayerId);

    if (!Number.isInteger(matchId) || matchId <= 0 || !Number.isInteger(candidatePlayerId) || candidatePlayerId <= 0) {
      return NextResponse.json({ message: "경기 또는 MVP 후보가 올바르지 않습니다." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 같은 경기의 마지막 표가 동시에 들어와도 자동 확정/재투표 전환이 한 번만 실행되도록 직렬화한다.
      await tx.$queryRaw`SELECT "id" FROM "DestructionMatch" WHERE "id" = ${matchId} FOR UPDATE`;

      const match = await tx.destructionMatch.findUnique({
        where: { id: matchId },
        include: {
          tournament: {
            include: {
              participants: { select: { playerId: true, teamId: true } },
            },
          },
        },
      });

      if (!match || !match.winnerTeamId) {
        return { status: "NOT_FOUND" as const };
      }

      if (match.mvpFinalizedAt) {
        return { status: "ALREADY_FINALIZED" as const };
      }

      const matchParticipants = match.tournament.participants.filter(
        (participant) => participant.teamId === match.teamAId || participant.teamId === match.teamBId,
      );

      if (matchParticipants.length !== 10) {
        return { status: "INVALID_PARTICIPANTS" as const };
      }

      if (!user.playerId || !matchParticipants.some((participant) => participant.playerId === user.playerId)) {
        return { status: "NOT_PARTICIPANT" as const };
      }

      if (candidatePlayerId === user.playerId) {
        return { status: "SELF_VOTE" as const };
      }

      const participantIds = new Set(matchParticipants.map((participant) => participant.playerId));
      const eligibleCandidateIds = match.mvpRevoteCandidateIds.length > 0
        ? new Set(match.mvpRevoteCandidateIds)
        : participantIds;

      if (!participantIds.has(candidatePlayerId) || !eligibleCandidateIds.has(candidatePlayerId)) {
        return { status: "INVALID_CANDIDATE" as const };
      }

      await tx.destructionMatchMvpVote.upsert({
        where: { matchId_voterUserAccountId: { matchId, voterUserAccountId: user.userAccountId } },
        create: { matchId, voterUserAccountId: user.userAccountId, candidatePlayerId },
        update: { candidatePlayerId },
      });

      const votes = await tx.destructionMatchMvpVote.findMany({
        where: {
          matchId,
          candidatePlayerId: { in: [...eligibleCandidateIds] },
          voter: {
            player: {
              is: { id: { in: [...participantIds] } },
            },
          },
        },
        select: { candidatePlayerId: true },
      });

      const resolution = resolveMvpVotes(votes.map((vote) => vote.candidatePlayerId));

      if (resolution.status === "PENDING") {
        return {
          status: "VOTED" as const,
          selectedCandidatePlayerId: candidatePlayerId,
          voteRound: match.mvpVoteRound,
        };
      }

      if (resolution.status === "FINALIZED") {
        const mvpPlayerId = resolution.mvpPlayerId;
        await tx.destructionMatch.update({
          where: { id: matchId },
          data: {
            mvpPlayerId,
            mvpSelectionMethod: "VOTE",
            mvpFinalizedAt: new Date(),
            mvpRevoteCandidateIds: [],
          },
        });
        await tx.adminLog.create({
          data: {
            action: "DESTRUCTION_MATCH_MVP_AUTO_FINALIZE",
            message: `멸망전 ${match.stage} ${match.round}경기 MVP 투표 자동 확정: 플레이어 #${mvpPlayerId}, ${match.mvpVoteRound}차 투표`,
          },
        });

        return { status: "FINALIZED" as const, mvpPlayerId };
      }

      await tx.destructionMatchMvpVote.deleteMany({ where: { matchId } });
      const nextRound = match.mvpVoteRound + 1;
      await tx.destructionMatch.update({
        where: { id: matchId },
        data: {
          mvpVoteRound: nextRound,
          mvpRevoteCandidateIds: resolution.candidatePlayerIds,
        },
      });
      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_MATCH_MVP_REVOTE",
          message: `멸망전 ${match.stage} ${match.round}경기 MVP ${nextRound}차 재투표 시작: 동률 후보 ${resolution.candidatePlayerIds.length}명`,
        },
      });

      return { status: "REVOTE" as const, voteRound: nextRound };
    });

    if (result.status === "NOT_FOUND") {
      return NextResponse.json({ message: "결과가 등록된 멸망전 경기를 찾을 수 없습니다." }, { status: 404 });
    }
    if (result.status === "ALREADY_FINALIZED") {
      return NextResponse.json({ message: "이미 MVP가 확정된 경기입니다." }, { status: 409 });
    }
    if (result.status === "INVALID_PARTICIPANTS") {
      return NextResponse.json({ message: "경기 참가자 10명이 확정되어야 투표할 수 있습니다." }, { status: 409 });
    }
    if (result.status === "NOT_PARTICIPANT") {
      return NextResponse.json({ message: "해당 경기 참가자 10명만 투표할 수 있습니다." }, { status: 403 });
    }
    if (result.status === "SELF_VOTE") {
      return NextResponse.json({ message: "본인에게는 투표할 수 없습니다." }, { status: 400 });
    }
    if (result.status === "INVALID_CANDIDATE") {
      return NextResponse.json({ message: "현재 투표 대상인 경기 참가자에게만 투표할 수 있습니다." }, { status: 400 });
    }

    if (result.status === "FINALIZED") {
      return NextResponse.json({
        status: result.status,
        message: "참가자 10명의 투표가 완료되어 MVP가 확정되었습니다.",
        mvpPlayerId: result.mvpPlayerId,
      });
    }

    if (result.status === "REVOTE") {
      return NextResponse.json({
        status: result.status,
        message: `공동 1위가 발생해 동률 후보 대상으로 ${result.voteRound}차 재투표를 시작합니다.`,
        voteRound: result.voteRound,
      });
    }

    return NextResponse.json({
      status: result.status,
      message: "투표가 저장되었습니다. 확정 전까지 변경할 수 있습니다.",
      selectedCandidatePlayerId: result.selectedCandidatePlayerId,
      voteRound: result.voteRound,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "로그인 후 투표할 수 있습니다." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "NOT_APPROVED") {
      return NextResponse.json({ message: "승인된 회원만 투표할 수 있습니다." }, { status: 403 });
    }
    logServerError("[DESTRUCTION_MATCH_MVP_VOTE_ERROR]", error);
    return NextResponse.json({ message: "MVP 투표 저장에 실패했습니다." }, { status: 500 });
  }
}
