import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
type DraftPlayerInput = {
  playerId: number | string;
  team: unknown;
  position: unknown;
};

type DraftRequestBody = {
  title?: unknown;
  players?: DraftPlayerInput[];
};
const TEAMS = ["BLUE", "RED"] as const;
const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

type TeamValue = (typeof TEAMS)[number];
type PositionValue = (typeof POSITIONS)[number];

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isTeam(value: unknown): value is TeamValue {
  return typeof value === "string" && (TEAMS as readonly string[]).includes(value);
}

function isPosition(value: unknown): value is PositionValue {
  return (
    typeof value === "string" &&
    (POSITIONS as readonly string[]).includes(value)
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DraftRequestBody;

    const title =
    typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "시즌내전 팀 밸런스";

    const players: DraftPlayerInput[] = Array.isArray(body.players)
    ? body.players
    : [];

    if (players.length === 0) {
      return NextResponse.json(
        { message: "저장할 팀 밸런스 참가자가 없습니다." },
        { status: 400 }
      );
    }

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const today = getTodayStart();

    const validPlayers: {
    playerId: number;
    team: TeamValue;
    position: PositionValue;
    }[] = players
    .map((player) => ({
        playerId: Number(player.playerId),
        team: player.team,
        position: player.position,
    }))
    .filter(
        (player): player is {
        playerId: number;
        team: TeamValue;
        position: PositionValue;
        } =>
        Number.isInteger(player.playerId) &&
        isTeam(player.team) &&
        isPosition(player.position)
    );
      
    if (validPlayers.length === 0) {
      return NextResponse.json(
        { message: "유효한 팀 밸런스 참가자 데이터가 없습니다." },
        { status: 400 }
      );
    }

    const draft = await prisma.$transaction(async (tx) => {
      const createdDraft = await tx.teamBalanceDraft.create({
        data: {
          title,
          seasonId: season?.id ?? null,
          applyDate: today,
        },
      });

      await tx.teamBalanceDraftPlayer.createMany({
        data: validPlayers.map((player) => ({
          draftId: createdDraft.id,
          playerId: player.playerId,
          team: player.team,
          position: player.position,
        })),
        skipDuplicates: true,
      });

      return tx.teamBalanceDraft.findUnique({
        where: {
          id: createdDraft.id,
        },
        include: {
          players: {
            include: {
              player: true,
            },
            orderBy: [
              {
                team: "asc",
              },
              {
                position: "asc",
              },
            ],
          },
        },
      });
    });

    return NextResponse.json({
      message: "팀 밸런스 결과가 저장되었습니다.",
      draft,
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_DRAFT_POST_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 결과 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}