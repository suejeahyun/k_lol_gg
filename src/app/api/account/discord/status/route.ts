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
        player: {
          select: {
            id: true,
            name: true,
            nickname: true,
            tag: true,
            currentTier: true,
            peakTier: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "계정을 찾을 수 없습니다." }, { status: 404 });
    }

    // /account 화면에서는 최근 음성 기록/연동 감사 로그를 노출하지 않습니다.
    // Discord 연동은 선택 사항이며, 운영 검증은 관리자 Discord 페이지에서 처리합니다.
    return NextResponse.json({ user, recentVoiceEvents: [], discordAccountLinkLogs: [] });
  } catch {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
}
