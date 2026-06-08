export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const discordId = String(body.discordId || "").trim();
  const channelId = textOrNull(body.channelId);
  const previousChannelId = textOrNull(body.previousChannelId);
  const eventType = String(body.eventType || "").trim().toUpperCase();

  if (!discordId || !["JOIN", "LEAVE", "MOVE"].includes(eventType)) {
    return NextResponse.json({ message: "discordId와 eventType(JOIN/LEAVE/MOVE)이 필요합니다." }, { status: 400 });
  }

  const user = await prisma.userAccount.findUnique({ where: { discordId }, select: { id: true } });

  const discordUsername = textOrNull(body.discordUsername);
  const discordGlobalName = textOrNull(body.discordGlobalName);
  const discordServerNickname = textOrNull(body.discordServerNickname ?? body.memberNickname);
  const memberDisplayName = textOrNull(body.memberDisplayName);
  const memberNickname = textOrNull(body.memberNickname);

  if (user?.id) {
    await prisma.userAccount.update({
      where: { id: user.id },
      data: {
        ...(discordUsername ? { discordUsername } : {}),
        ...(discordGlobalName ? { discordGlobalName } : {}),
        ...(discordServerNickname ? { discordServerNickname } : {}),
      },
    }).catch(() => null);
  }

  const event = await prisma.discordVoiceEvent.create({
    data: {
      discordId,
      channelId,
      previousChannelId,
      eventType,
      channelName: textOrNull(body.channelName),
      previousChannelName: textOrNull(body.previousChannelName),
      categoryId: textOrNull(body.categoryId),
      previousCategoryId: textOrNull(body.previousCategoryId),
      categoryName: textOrNull(body.categoryName),
      previousCategoryName: textOrNull(body.previousCategoryName),
      discordUsername,
      discordGlobalName,
      discordServerNickname,
      memberDisplayName,
      memberNickname,
      rawJson: body as Prisma.InputJsonValue,
      userAccountId: user?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true, eventId: event.id, linkedUserAccountId: user?.id ?? null });
}
