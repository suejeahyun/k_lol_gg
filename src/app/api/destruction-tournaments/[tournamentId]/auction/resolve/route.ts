export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { readJsonObject } from "@/lib/http/json-body";

type RouteProps = { params: Promise<{ tournamentId: string }> };

type ResolveBody = {
  participantId?: number;
  action?: "SOLD" | "HOLD";
  teamId?: number;
  purchasePoint?: number;
};

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);
    const body = await readJsonObject<ResolveBody>(req);
    if (!body) {
      return NextResponse.json({ message: "올바른 JSON 요청 본문이 필요합니다." }, { status: 400 });
    }
    const participantId = Number(body.participantId);
    const action = body.action;

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(participantId) || participantId <= 0) {
      return NextResponse.json({ message: "요청 정보가 올바르지 않습니다." }, { status: 400 });
    }

    if (action !== "SOLD" && action !== "HOLD") {
      return NextResponse.json({ message: "처리 방식이 올바르지 않습니다." }, { status: 400 });
    }

    const participant = await prisma.destructionParticipant.findFirst({
      where: { id: participantId, tournamentId: id },
      include: { player: true },
    });

    if (!participant || participant.isCaptain) {
      return NextResponse.json({ message: "경매 대상 참가자를 찾을 수 없습니다." }, { status: 404 });
    }

    if (participant.auctionStatus !== "DRAWN" && participant.auctionStatus !== "HOLD") {
      return NextResponse.json({ message: "현재 추첨된 참가자만 처리할 수 있습니다." }, { status: 400 });
    }

    if (action === "HOLD") {
      const updated = await prisma.destructionParticipant.update({
        where: { id: participant.id },
        data: { auctionStatus: "HOLD", teamId: null, purchasePoint: null, soldAt: null },
        include: { player: true, team: true },
      });

      await prisma.adminLog.create({
        data: {
          action: "DESTRUCTION_AUCTION_HOLD",
          message: `멸망전 경매 보류: ${participant.player.nickname}#${participant.player.tag}`,
        },
      });

      return NextResponse.json({ participant: updated });
    }

    const teamId = Number(body.teamId);
    const purchasePoint = Number(body.purchasePoint);

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return NextResponse.json({ message: "낙찰 팀장을 선택해주세요." }, { status: 400 });
    }

    if (!Number.isInteger(purchasePoint) || purchasePoint < 1) {
      return NextResponse.json({ message: "낙찰 포인트는 최소 1포인트 이상이어야 합니다." }, { status: 400 });
    }

    const team = await prisma.destructionTeam.findFirst({
      where: { id: teamId, tournamentId: id },
      include: {
        members: {
          include: { player: true },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ message: "멸망전 팀을 찾을 수 없습니다." }, { status: 404 });
    }

    if (team.remainingAuctionPoints < purchasePoint) {
      return NextResponse.json({ message: "팀장의 남은 포인트를 초과할 수 없습니다." }, { status: 400 });
    }

    if (team.members.length >= 5) {
      return NextResponse.json({ message: "선택한 팀은 이미 5명입니다." }, { status: 400 });
    }

    const duplicatedPosition = team.members.some((member) => member.position === participant.position);

    if (duplicatedPosition) {
      return NextResponse.json(
        { message: `포지션 중복 불가: ${team.name}에는 이미 ${participant.position} 포지션이 있습니다.` },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.destructionTeam.update({
        where: { id: team.id },
        data: {
          remainingAuctionPoints: { decrement: purchasePoint },
        },
      });

      const sold = await tx.destructionParticipant.update({
        where: { id: participant.id },
        data: {
          teamId: team.id,
          auctionStatus: "SOLD",
          purchasePoint,
          soldAt: new Date(),
        },
        include: { player: true, team: true },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_AUCTION_SOLD",
          message: `멸망전 경매 낙찰: ${participant.player.nickname}#${participant.player.tag} -> ${team.name} / ${purchasePoint}P`,
        },
      });

      return sold;
    });

    return NextResponse.json({ participant: updated });
  } catch (error) {
    logServerError("[DESTRUCTION_AUCTION_RESOLVE_ERROR]", error);
    return NextResponse.json({ message: "경매 결과 처리 실패" }, { status: 500 });
  }
}

