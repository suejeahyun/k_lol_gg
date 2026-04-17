import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreateSeasonBody = {
  name: string;
};

export async function GET() {
  try {
    const seasons = await prisma.season.findMany({
      orderBy: {
        id: "desc",
      },
    });

    return NextResponse.json(seasons);
  } catch (error) {
    console.error("[SEASONS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch seasons" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateSeasonBody;
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { message: "시즌 이름을 입력해주세요." },
        { status: 400 }
      );
    }

    const existing = await prisma.season.findFirst({
      where: {
        name,
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "이미 같은 이름의 시즌이 있습니다." },
        { status: 400 }
      );
    }

    const activeSeason = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
    });

    const created = await prisma.season.create({
      data: {
        name,
        isActive: activeSeason ? false : true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[SEASON_CREATE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to create season" },
      { status: 500 }
    );
  }
}