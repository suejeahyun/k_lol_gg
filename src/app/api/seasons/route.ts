export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { readJsonObject } from "@/lib/http/json-body";

type CreateSeasonBody = {
  name?: unknown;
};

const MAX_ADMIN_SEASONS = 100;

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const seasons = await prisma.season.findMany({
      orderBy: {
        id: "desc",
      },
      take: MAX_ADMIN_SEASONS,
    });

    return NextResponse.json(seasons);
  } catch (error) {
    logServerError("[SEASONS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch seasons" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await readJsonObject<CreateSeasonBody>(req);
    if (!body) {
      return NextResponse.json(
        { message: "올바른 JSON 요청 본문이 필요합니다." },
        { status: 400 },
      );
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";

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

    const created = await prisma.$transaction(async (tx) => {
      const season = await tx.season.create({
        data: {
          name,
          isActive: activeSeason ? false : true,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "SEASON_CREATE",
          message: `시즌 등록: ${season.name}${season.isActive ? " / 활성 시즌" : ""}`,
        },
      });

      return season;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logServerError("[SEASON_CREATE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to create season" },
      { status: 500 }
    );
  }
}

