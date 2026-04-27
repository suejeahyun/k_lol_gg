import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET() {
  try {
    const today = getTodayStart();

    const draft = await prisma.teamBalanceDraft.findFirst({
      where: {
        applyDate: today,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        players: {
          include: {
            player: {
              select: {
                id: true,
                name: true,
                nickname: true,
                tag: true,
                currentTier: true,
                peakTier: true,
              },
            },
          },
          orderBy: [
            { team: "asc" },
            { position: "asc" },
          ],
        },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { message: "저장된 팀 밸런스 결과가 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: draft.id,
      title: draft.title,
      applyDate: draft.applyDate,

      teams: {
        BLUE: draft.players
          .filter((p) => p.team === "BLUE")
          .map((p) => ({
            playerId: p.player.id,
            name: p.player.name,
            nickname: p.player.nickname,
            tag: p.player.tag,
            currentTier: p.player.currentTier,
            peakTier: p.player.peakTier,
            position: p.position,
          })),

        RED: draft.players
          .filter((p) => p.team === "RED")
          .map((p) => ({
            playerId: p.player.id,
            name: p.player.name,
            nickname: p.player.nickname,
            tag: p.player.tag,
            currentTier: p.player.currentTier,
            peakTier: p.player.peakTier,
            position: p.position,
          })),
      },
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_LATEST_GET_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 결과 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}