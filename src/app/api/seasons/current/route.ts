export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const season = await prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
    });

    if (!season) {
      return NextResponse.json(
        {
          ok: false,
          statusCode: 404,
          message: "활성 시즌이 없습니다.",
          season: null,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      statusCode: 200,
      season,
    });
  } catch (error) {
    console.error("[CURRENT_SEASON_GET_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        statusCode: 500,
        message: "현재 시즌 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
