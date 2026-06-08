export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const discordId = String(body.discordId || "").trim();
  const channelId = body.channelId ? String(body.channelId) : null;
  const previousChannelId = body.previousChannelId ? String(body.previousChannelId) : null;
  const eventType = String(body.eventType || "").trim().toUpperCase();

  if (!discordId || !["JOIN", "LEAVE", "MOVE"].includes(eventType)) {
    return NextResponse.json({ message: "discordId와 eventType(JOIN/LEAVE/MOVE)이 필요합니다." }, { status: 400 });
  }

  const user = await prisma.userAccount.findUnique({ where: { discordId }, select: { id: true } });

  const event = await prisma.discordVoiceEvent.create({
    data: {
      discordId,
      channelId,
      previousChannelId,
      eventType,
      rawJson: body as Prisma.InputJsonValue,
      userAccountId: user?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true, eventId: event.id, linkedUserAccountId: user?.id ?? null });
}
