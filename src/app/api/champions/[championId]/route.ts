import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{ championId: string }>;
};

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { championId } = await params;
    const id = Number(championId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid championId" },
        { status: 400 }
      );
    }

    const champion = await prisma.champion.findUnique({
      where: { id },
    });

    if (!champion) {
      return NextResponse.json(
        { message: "Champion not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(champion);
  } catch (error) {
    console.error("[CHAMPION_DETAIL_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to fetch champion" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { championId } = await params;
    const id = Number(championId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid championId" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const imageUrl = String(body.imageUrl ?? "").trim();

    if (!name || !imageUrl) {
      return NextResponse.json(
        { message: "챔피언 이름과 이미지 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    const updated = await prisma.champion.update({
      where: { id },
      data: {
        name,
        imageUrl,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[CHAMPION_PATCH_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to update champion" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { championId } = await params;
    const id = Number(championId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid championId" },
        { status: 400 }
      );
    }

    await prisma.champion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHAMPION_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "삭제할 수 없습니다. 경기 기록에 연결되어 있을 수 있습니다." },
      { status: 500 }
    );
  }
}