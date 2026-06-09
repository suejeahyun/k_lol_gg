import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";

export type DiscordAccountSnapshot = {
  discordId: string | null;
  discordUsername: string | null;
  discordGlobalName: string | null;
  discordServerNickname: string | null;
  discordAvatar?: string | null;
  discordLinkedAt?: Date | null;
  discordLinkStatus?: string | null;
};

type LinkLogParams = {
  userAccountId?: number | null;
  action: string;
  actorId?: number | null;
  actorType?: string | null;
  reason?: string | null;
  before?: DiscordAccountSnapshot | null;
  after?: DiscordAccountSnapshot | null;
  db?: typeof prisma | Prisma.TransactionClient;
};

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeDiscordAccountLinkLog({
  userAccountId = null,
  action,
  actorId = null,
  actorType = null,
  reason = null,
  before = null,
  after = null,
  db = prisma,
}: LinkLogParams) {
  const discordId = after?.discordId || before?.discordId || null;
  const discordUsername = after?.discordUsername || before?.discordUsername || null;
  const discordGlobalName = after?.discordGlobalName || before?.discordGlobalName || null;
  const discordServerNickname = after?.discordServerNickname || before?.discordServerNickname || null;

  await db.discordAccountLinkLog.create({
    data: {
      userAccountId,
      action,
      discordId,
      discordUsername,
      discordGlobalName,
      discordServerNickname,
      actorId,
      actorType,
      reason,
      beforeJson: asJson(before),
      afterJson: asJson(after),
    },
  }).catch((error) => {
    console.error("[DISCORD_ACCOUNT_LINK_LOG_ERROR]", error);
  });

  await writeAdminLog({
    action,
    message: `Discord 계정 ${action}: userAccountId=${userAccountId ?? "-"}, discordId=${discordId ?? "-"}`,
    actorId,
    actorType,
    targetType: "UserAccount",
    targetId: userAccountId ?? null,
    beforeJson: asJson(before) ?? null,
    afterJson: asJson(after) ?? null,
    db: db as never,
  });
}

export function toDiscordSnapshot(user: DiscordAccountSnapshot | null | undefined): DiscordAccountSnapshot | null {
  if (!user) return null;
  return {
    discordId: user.discordId ?? null,
    discordUsername: user.discordUsername ?? null,
    discordGlobalName: user.discordGlobalName ?? null,
    discordServerNickname: user.discordServerNickname ?? null,
    discordAvatar: user.discordAvatar ?? null,
    discordLinkedAt: user.discordLinkedAt ?? null,
    discordLinkStatus: user.discordLinkStatus ?? null,
  };
}
