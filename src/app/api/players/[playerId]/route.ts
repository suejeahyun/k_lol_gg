import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid playerId" },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return NextResponse.json(
        { message: "Player not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(player);
  } catch (error) {
    console.error("[PLAYER_DETAIL_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to fetch player" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid playerId" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const nickname = String(body.nickname ?? "").trim();
    const tag = String(body.tag ?? "").trim();

    if (!name || !nickname || !tag) {
      return NextResponse.json(
        { message: "이름, 닉네임, 태그를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    const updated = await prisma.player.update({
      where: { id },
      data: {
        name,
        nickname,
        tag,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PLAYER_PATCH_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to update player" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid playerId" },
        { status: 400 }
      );
    }

    await prisma.player.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PLAYER_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "삭제할 수 없습니다. 경기 기록에 연결되어 있을 수 있습니다." },
      { status: 500 }
    );
  }
}