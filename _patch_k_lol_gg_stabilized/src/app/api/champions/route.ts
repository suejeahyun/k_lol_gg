export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { PUBLIC_MEDIUM_CACHE_HEADER } from "@/lib/http/cache";

type CreateChampionBody = {
  name: string;
  imageUrl: string;
};

export async function GET() {
  try {
    const champions = await prisma.champion.findMany({
      orderBy: { id: "desc" },
      take: 300,
    });

    return NextResponse.json(champions, {
      headers: {
        "Cache-Control": PUBLIC_MEDIUM_CACHE_HEADER,
      },
    });
  } catch (error) {
    console.error("[CHAMPIONS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to fetch champions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

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

    await writeAdminLog({
      action: "CHAMPION_CREATE",
      message: `챔피언 등록: ${created.name}`,
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
