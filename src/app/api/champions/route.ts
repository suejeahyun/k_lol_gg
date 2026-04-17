import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreateChampionBody = {
  name: string;
  imageUrl: string;
};

export async function GET() {
  try {
    const champions = await prisma.champion.findMany({
      orderBy: { id: "desc" },
    });

    return NextResponse.json(champions);
  } catch (error) {
    console.error("[CHAMPIONS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to fetch champions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateChampionBody;

    const name = body.name?.trim();
    const imageUrl = body.imageUrl?.trim();

    if (!name || !imageUrl) {
      return NextResponse.json(
        { message: "챔피언 이름과 이미지 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    const created = await prisma.champion.create({
      data: {
        name,
        imageUrl,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[CHAMPION_CREATE_POST_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to create champion" },
      { status: 500 }
    );
  }
}