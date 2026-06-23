import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";

const VISITOR_LIMIT = 80;
const ONLINE_WINDOW_MINUTES = 10;

function getKstDateStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -9, 0, 0, 0));
}

function toVisitor(visit: {
  visitedAt: Date;
  user: { userId: string; player: { nickname: string; tag: string } | null };
}) {
  return {
    userId: visit.user.userId,
    name: visit.user.player?.nickname ?? visit.user.userId,
    tag: visit.user.player?.tag ?? null,
    visitedAt: visit.visitedAt,
  };
}

export async function GET() {
  try {
    const visitDate = getKstDateStart();
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000);

    const visits = await prisma.communityVisit.findMany({
      where: { visitDate },
      orderBy: { visitedAt: "desc" },
      take: VISITOR_LIMIT,
      include: {
        user: {
          select: {
            userId: true,
            player: { select: { nickname: true, tag: true } },
          },
        },
      },
    });

    const todayVisitors = visits.map(toVisitor);
    const onlineVisitors = visits.filter((visit) => visit.visitedAt >= onlineSince).map(toVisitor);

    return NextResponse.json({
      visitors: todayVisitors,
      todayVisitors,
      onlineVisitors,
      onlineWindowMinutes: ONLINE_WINDOW_MINUTES,
    });
  } catch (error) {
    logServerError("[COMMUNITY_VISITS_GET_ERROR]", error);
    return NextResponse.json({ message: "금일 방문자를 불러오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const visitDate = getKstDateStart();

    await prisma.communityVisit.upsert({
      where: {
        userId_visitDate: {
          userId: user.userAccountId,
          visitDate,
        },
      },
      update: { visitedAt: new Date() },
      create: {
        userId: user.userAccountId,
        visitDate,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("[COMMUNITY_VISITS_POST_ERROR]", error);
    return NextResponse.json({ message: "방문 기록 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
