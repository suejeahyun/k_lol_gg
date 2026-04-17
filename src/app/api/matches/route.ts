import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const matches = await prisma.matchSeries.findMany({
      include: {
        season: true,
        games: true,
      },
      orderBy: {
        matchDate: "desc",
      },
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "내전 조회 실패" },
      { status: 500 }
    );
  }
}