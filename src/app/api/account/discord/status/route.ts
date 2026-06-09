export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await requireUser();
    const user = await prisma.userAccount.findUnique({
      where: { id: session.userAccountId },
      select: {
        id: true,
        userId: true,
        status: true,
        role: true,
        discordId: true,
        discordUsername: true,
        discordGlobalName: true,
        discordServerNickname: true,
        discordAvatar: true,
        discordLinkedAt: true,
        discordLinkStatus: true,
        discordParsedBirthYear: true,
        discordParsedName: true,
        discordParsedNickname: true,
        discordParsedTier: true,
        player: { select: { id: true, name: true, nickname: true, tag: true, currentTier: true, peakTier: true } },
        discordAccountLinkLogs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!user) return NextResponse.json({ message: "계정을 찾을 수 없습니다." }, { status: 404 });

    const recentVoiceEvents = user.discordId ? await prisma.discordVoiceEvent.findMany({
      where: { discordId: user.discordId },
      orderBy: { occurredAt: "desc" },
      take: 10,
    }) : [];

    return NextResponse.json({ user, recentVoiceEvents });
  } catch {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
}
