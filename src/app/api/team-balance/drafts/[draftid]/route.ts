import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<Record<string, string>>;
};

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const resolvedParams = await params;

    const rawDraftId =
      resolvedParams.draftId ??
      resolvedParams.id ??
      Object.values(resolvedParams)[0] ??
      "";

    const id = Number(decodeURIComponent(rawDraftId));

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "유효한 팀 밸런스 결과를 선택해주세요." },
        { status: 400 }
      );
    }

    const draft = await prisma.teamBalanceDraft.findUnique({
      where: { id },
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
          orderBy: [{ team: "asc" }, { position: "asc" }],
        },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { message: "팀 밸런스 결과를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: draft.id,
      title: draft.title,
      label: draft.title,
      applyDate: draft.applyDate.toISOString(),
      teams: {
        BLUE: draft.players
          .filter((item) => item.team === "BLUE")
          .map((item) => ({
            playerId: item.player.id,
            name: item.player.name,
            nickname: item.player.nickname,
            tag: item.player.tag,
            currentTier: item.player.currentTier,
            peakTier: item.player.peakTier,
            position: item.position,
          })),
        RED: draft.players
          .filter((item) => item.team === "RED")
          .map((item) => ({
            playerId: item.player.id,
            name: item.player.name,
            nickname: item.player.nickname,
            tag: item.player.tag,
            currentTier: item.player.currentTier,
            peakTier: item.player.peakTier,
            position: item.position,
          })),
      },
    });
  } catch (error) {
    console.error("[TEAM_BALANCE_DRAFT_DETAIL_GET_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 결과 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}