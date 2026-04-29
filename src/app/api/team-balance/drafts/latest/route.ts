import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const draft = await prisma.teamBalanceDraft.findFirst({
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
      orderBy: [
        { applyDate: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });

    if (!draft) {
      return NextResponse.json(
        { message: "저장된 팀 밸런스 결과가 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: draft.id,
      title: draft.title,
      label: draft.title,
      applyDate: draft.applyDate.toISOString(),
      teams: {
        BLUE: draft.players
          .filter((draftPlayer) => draftPlayer.team === "BLUE")
          .map((draftPlayer) => ({
            playerId: draftPlayer.player.id,
            name: draftPlayer.player.name,
            nickname: draftPlayer.player.nickname,
            tag: draftPlayer.player.tag,
            currentTier: draftPlayer.player.currentTier,
            peakTier: draftPlayer.player.peakTier,
            position: draftPlayer.position,
          })),
        RED: draft.players
          .filter((draftPlayer) => draftPlayer.team === "RED")
          .map((draftPlayer) => ({
            playerId: draftPlayer.player.id,
            name: draftPlayer.player.name,
            nickname: draftPlayer.player.nickname,
            tag: draftPlayer.player.tag,
            currentTier: draftPlayer.player.currentTier,
            peakTier: draftPlayer.player.peakTier,
            position: draftPlayer.position,
          })),
      },
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_DRAFT_LATEST_GET_ERROR]", error);
    return NextResponse.json(
      { message: "최신 팀 밸런스 결과 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
