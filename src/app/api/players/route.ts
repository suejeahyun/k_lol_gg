import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreatePlayerBody = {
  name: string;
  nickname: string;
  tag: string;
};

export async function GET() {
  try {
    const players = await prisma.player.findMany({
      orderBy: { id: "desc" },
    });

    return NextResponse.json(players);
  } catch (error) {
    console.error("[PLAYERS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to fetch players" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePlayerBody;

    const name = body.name?.trim();
    const nickname = body.nickname?.trim();
    const tag = body.tag?.trim();

    if (!name || !nickname || !tag) {
      return NextResponse.json(
        { message: "이름, 닉네임, 태그를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    const created = await prisma.player.create({
      data: {
        name,
        nickname,
        tag,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[PLAYER_CREATE_POST_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to create player" },
      { status: 500 }
    );
  }
}