import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireUser } from "@/lib/auth/session";
import { toDiscordSnapshot, writeDiscordAccountLinkLog } from "@/lib/discord/account-link";

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const body = await req.json().catch(() => ({})) as { reason?: string };
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.userAccount.findUniqueOrThrow({ where: { id: session.userAccountId } });
      if (!before.discordId) return before;
      const user = await tx.userAccount.update({
        where: { id: session.userAccountId },
        data: {
          discordId: null,
          discordUsername: null,
          discordGlobalName: null,
          discordServerNickname: null,
          discordAvatar: null,
          discordLinkedAt: null,
          discordParsedBirthYear: null,
          discordParsedName: null,
          discordParsedNickname: null,
          discordParsedTier: null,
          discordLinkStatus: "UNLINKED",
        },
      });
      await writeDiscordAccountLinkLog({
        userAccountId: user.id,
        action: "DISCORD_UNLINKED_BY_USER",
        actorId: user.id,
        actorType: "USER",
        reason: body.reason || null,
        before: toDiscordSnapshot(before),
        after: toDiscordSnapshot(user),
        db: tx,
      });
      return user;
    });

    return NextResponse.json({ ok: true, userAccountId: updated.id });
  } catch (error) {
    logServerError("[ACCOUNT_DISCORD_UNLINK_ERROR]", error);
    return NextResponse.json({ message: "Discord 연동 해제 중 오류가 발생했습니다." }, { status: 500 });
  }
}

