export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const botId = String(body.botId || body.clientId || "klol-discord-operation-server").trim();
  const rawJson = body as Prisma.InputJsonValue;

  const heartbeat = await prisma.discordBotHeartbeat.upsert({
    where: { botId },
    create: {
      botId,
      status: String(body.status || "ONLINE"),
      botUsername: typeof body.botUsername === "string" ? body.botUsername : null,
      guildId: typeof body.guildId === "string" ? body.guildId : null,
      uptimeSeconds: Number.isFinite(Number(body.uptimeSeconds)) ? Number(body.uptimeSeconds) : 0,
      memoryRssMb: Number.isFinite(Number(body.memoryRssMb)) ? Number(body.memoryRssMb) : null,
      watchedChannelCount: Number.isFinite(Number(body.watchedChannelCount)) ? Number(body.watchedChannelCount) : 0,
      voiceMemberCount: Number.isFinite(Number(body.voiceMemberCount)) ? Number(body.voiceMemberCount) : 0,
      autoFinishEnabled: Boolean(body.autoFinishEnabled),
      lastAutoFinishCheckAt: typeof body.lastAutoFinishCheckAt === "string" ? new Date(body.lastAutoFinishCheckAt) : null,
      lastError: typeof body.lastError === "string" ? body.lastError.slice(0, 2000) : null,
      rawJson,
    },
    update: {
      status: String(body.status || "ONLINE"),
      botUsername: typeof body.botUsername === "string" ? body.botUsername : null,
      guildId: typeof body.guildId === "string" ? body.guildId : null,
      uptimeSeconds: Number.isFinite(Number(body.uptimeSeconds)) ? Number(body.uptimeSeconds) : 0,
      memoryRssMb: Number.isFinite(Number(body.memoryRssMb)) ? Number(body.memoryRssMb) : null,
      watchedChannelCount: Number.isFinite(Number(body.watchedChannelCount)) ? Number(body.watchedChannelCount) : 0,
      voiceMemberCount: Number.isFinite(Number(body.voiceMemberCount)) ? Number(body.voiceMemberCount) : 0,
      autoFinishEnabled: Boolean(body.autoFinishEnabled),
      lastAutoFinishCheckAt: typeof body.lastAutoFinishCheckAt === "string" ? new Date(body.lastAutoFinishCheckAt) : null,
      lastError: typeof body.lastError === "string" ? body.lastError.slice(0, 2000) : null,
      rawJson,
    },
  });

  return NextResponse.json({ ok: true, heartbeatId: heartbeat.id, serverTime: new Date().toISOString() });
}
