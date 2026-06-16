export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { applyDestructionRecruitmentAutoReserve } from "@/lib/destruction/recruitment-auto-reserve";
import { getCurrentUser, requireApprovedUser } from "@/lib/auth/session";
import { rejectIfRateLimited } from "@/lib/rate-limit";

const APPLY_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

type RouteContext = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type ApplyPositionValue = (typeof APPLY_POSITIONS)[number];

function isApplyPosition(value: unknown): value is ApplyPositionValue {
  return (
    typeof value === "string" &&
    (APPLY_POSITIONS as readonly string[]).includes(value)
  );
}

function parseCaptainPreference(body: Record<string, unknown>) {
  if (body.captainPreference === "PREFERRED") return true;
  if (body.captainPreference === "NOT_PREFERRED") return false;
  return Boolean(body.isCaptain);
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 },
      );
    }

    const [tournament, currentUser] = await Promise.all([
      prisma.destructionTournament.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          status: true,
        },
      }),
      getCurrentUser(),
    ]);

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const applies = await prisma.destructionParticipationApply.findMany({
      where: {
        tournamentId: id,
        status: {
          in: ["APPLIED", "CONFIRMED", "RESERVE"],
        },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            nickname: true,
            tag: true,
            peakTier: true,
            currentTier: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const currentApply = currentUser?.playerId
      ? await prisma.destructionParticipationApply.findUnique({
          where: {
            tournamentId_playerId: {
              tournamentId: id,
              playerId: currentUser.playerId,
            },
          },
          select: {
            id: true,
            status: true,
            mainPosition: true,
            isCaptain: true,
          },
        })
      : null;

    return NextResponse.json({
      tournament,
      currentApply,
      players: applies.map((apply) => ({
        id: apply.player.id,
        name: apply.player.name,
        nickname: apply.player.nickname,
        tag: apply.player.tag,
        peakTier: apply.player.peakTier,
        currentTier: apply.player.currentTier,
        mainPosition: apply.mainPosition,
        subPositions: [],
        isCaptain: apply.isCaptain,
        status: apply.status,
      })),
    });
  } catch (error: unknown) {
    console.error("[DESTRUCTION_PARTICIPATION_GET_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가자 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "DESTRUCTION_PARTICIPATION_APPLY",
      limit: 12,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json(
        { message: "연결된 플레이어 정보가 없습니다." },
        { status: 400 },
      );
    }

    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mainPosition = body.mainPosition;
    const isCaptain = parseCaptainPreference(body);

    if (!isApplyPosition(mainPosition)) {
      return NextResponse.json(
        { message: "주 포지션을 선택해주세요." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (tournament.status !== "RECRUITING") {
      return NextResponse.json(
        { message: "현재 모집 중인 멸망전이 아닙니다." },
        { status: 400 },
      );
    }

    const apply = await prisma.destructionParticipationApply.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId: user.playerId,
        },
      },
      update: {
        mainPosition,
        subPositions: [],
        isCaptain,
        status: "APPLIED",
      },
      create: {
        tournamentId: id,
        playerId: user.playerId,
        mainPosition,
        subPositions: [],
        isCaptain,
        status: "APPLIED",
      },
    });

    await applyDestructionRecruitmentAutoReserve(id);

    await writeAdminLog({
      action: "DESTRUCTION_PARTICIPATION_APPLY",
      message: `멸망전 참가 신청: 멸망전 #${id} ${tournament.title}, 플레이어 #${user.playerId}, 신청 #${apply.id}, 팀장선호 ${isCaptain ? "Y" : "N"}`,
    });

    return NextResponse.json({
      message: "멸망전 참가 신청이 완료되었습니다.",
      apply,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
          { message: "로그인이 필요합니다." },
          { status: 401 },
        );
      }

      if (error.message === "NOT_APPROVED") {
        return NextResponse.json(
          { message: "관리자 승인 후 참가 신청이 가능합니다." },
          { status: 403 },
        );
      }
    }

    console.error("[DESTRUCTION_PARTICIPATION_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가 신청 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "DESTRUCTION_PARTICIPATION_CANCEL",
      limit: 12,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json(
        { message: "연결된 플레이어 정보가 없습니다." },
        { status: 400 },
      );
    }

    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (tournament.status !== "RECRUITING") {
      return NextResponse.json(
        { message: "모집 중일 때만 참가 신청을 취소할 수 있습니다." },
        { status: 400 },
      );
    }

    const apply = await prisma.destructionParticipationApply.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId: user.playerId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!apply || apply.status === "CANCELLED") {
      return NextResponse.json(
        { message: "취소할 참가 신청이 없습니다." },
        { status: 404 },
      );
    }

    const cancelled = await prisma.destructionParticipationApply.update({
      where: {
        id: apply.id,
      },
      data: {
        status: "CANCELLED",
      },
    });

    await applyDestructionRecruitmentAutoReserve(id);

    await writeAdminLog({
      action: "DESTRUCTION_PARTICIPATION_CANCEL",
      message: `멸망전 참가 취소: 멸망전 #${id} ${tournament.title}, 플레이어 #${user.playerId}, 신청 #${apply.id}`,
    });

    return NextResponse.json({
      message: "멸망전 참가 신청이 취소되었습니다.",
      apply: cancelled,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
          { message: "로그인이 필요합니다." },
          { status: 401 },
        );
      }

      if (error.message === "NOT_APPROVED") {
        return NextResponse.json(
          { message: "관리자 승인 후 참가 신청 취소가 가능합니다." },
          { status: 403 },
        );
      }
    }

    console.error("[DESTRUCTION_PARTICIPATION_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가 취소 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
