import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { toDiscordSnapshot, writeDiscordAccountLinkLog } from "@/lib/discord/account-link";
import { writeSecurityAudit } from "@/lib/security/admin-audit";

export async function PATCH(req: NextRequest, props: { params: Promise<{ userAccountId: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const params = await props.params;
  const userAccountId = Number(params.userAccountId);
  if (!Number.isFinite(userAccountId)) return NextResponse.json({ message: "회원 ID가 올바르지 않습니다." }, { status: 400 });
  const body = await req.json().catch(() => ({})) as { reason?: string };

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.userAccount.findUniqueOrThrow({ where: { id: userAccountId } });
      if (!before.discordId) return before;
      const user = await tx.userAccount.update({
        where: { id: userAccountId },
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
          discordLinkStatus: "UNLINKED_BY_ADMIN",
        },
      });
      await writeDiscordAccountLinkLog({
        userAccountId: user.id,
        action: "DISCORD_UNLINKED_BY_ADMIN",
        actorId: admin.user.id,
        actorType: admin.user.role,
        reason: body.reason || "ADMIN_REQUEST",
        before: toDiscordSnapshot(before),
        after: toDiscordSnapshot(user),
        db: tx,
      });
      await writeSecurityAudit({
        req,
        admin,
        action: "USER_DISCORD_UNLINK",
        message: `회원 Discord 연동 해제: #${user.id} ${user.userId}`,
        targetType: "UserAccount",
        targetId: user.id,
        beforeJson: toDiscordSnapshot(before),
        afterJson: toDiscordSnapshot(user),
        db: tx,
      });
      return user;
    });
    return NextResponse.json({ ok: true, userAccountId: updated.id });
  } catch (error) {
    logServerError("[ADMIN_USER_DISCORD_UNLINK_ERROR]", error);
    return NextResponse.json({ message: "Discord 연동 초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
