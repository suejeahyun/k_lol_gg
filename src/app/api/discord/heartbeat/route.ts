export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

type HeartbeatRow = { id: number };

function toNullableString(value: unknown, maxLength?: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return typeof maxLength === "number" ? trimmed.slice(0, maxLength) : trimmed;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function ensureDiscordBotHeartbeatTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DiscordBotHeartbeat" (
      "id" SERIAL PRIMARY KEY,
      "botId" TEXT NOT NULL UNIQUE,
      "status" TEXT NOT NULL DEFAULT 'ONLINE',
      "botUsername" TEXT,
      "guildId" TEXT,
      "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
      "memoryRssMb" DOUBLE PRECISION,
      "watchedChannelCount" INTEGER NOT NULL DEFAULT 0,
      "voiceMemberCount" INTEGER NOT NULL DEFAULT 0,
      "autoFinishEnabled" BOOLEAN NOT NULL DEFAULT false,
      "lastAutoFinishCheckAt" TIMESTAMP(3),
      "lastError" TEXT,
      "rawJson" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const botId = String(body.botId || body.clientId || "klol-discord-operation-server").trim();
  const status = toNullableString(body.status, 50) || "ONLINE";
  const botUsername =
    toNullableString(body.botUsername, 200) ||
    toNullableString(body.botUserTag, 200) ||
    toNullableString(body.tag, 200);
  const guildId = toNullableString(body.guildId, 100);
  const uptimeSeconds = Math.max(0, Math.floor(toNumber(body.uptimeSeconds, 0)));
  const memoryRssMb = Number.isFinite(Number(body.memoryRssMb)) ? Number(body.memoryRssMb) : null;
  const watchedChannelCount = Math.max(0, Math.floor(toNumber(body.watchedChannelCount, 0)));
  const voiceMemberCount = Math.max(0, Math.floor(toNumber(body.voiceMemberCount, 0)));
  const autoFinishEnabled = Boolean(body.autoFinishEnabled);
  const lastAutoFinishCheckAt = toNullableDate(body.lastAutoFinishCheckAt);
  const lastError = toNullableString(body.lastError, 2000);
  const rawJson = JSON.stringify(body ?? {});

  try {
    await ensureDiscordBotHeartbeatTable();

    const rows = await prisma.$queryRaw<HeartbeatRow[]>`
      INSERT INTO "DiscordBotHeartbeat" (
        "botId",
        "status",
        "botUsername",
        "guildId",
        "uptimeSeconds",
        "memoryRssMb",
        "watchedChannelCount",
        "voiceMemberCount",
        "autoFinishEnabled",
        "lastAutoFinishCheckAt",
        "lastError",
        "rawJson",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${botId},
        ${status},
        ${botUsername},
        ${guildId},
        ${uptimeSeconds},
        ${memoryRssMb},
        ${watchedChannelCount},
        ${voiceMemberCount},
        ${autoFinishEnabled},
        ${lastAutoFinishCheckAt},
        ${lastError},
        ${rawJson}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("botId") DO UPDATE SET
        "status" = EXCLUDED."status",
        "botUsername" = EXCLUDED."botUsername",
        "guildId" = EXCLUDED."guildId",
        "uptimeSeconds" = EXCLUDED."uptimeSeconds",
        "memoryRssMb" = EXCLUDED."memoryRssMb",
        "watchedChannelCount" = EXCLUDED."watchedChannelCount",
        "voiceMemberCount" = EXCLUDED."voiceMemberCount",
        "autoFinishEnabled" = EXCLUDED."autoFinishEnabled",
        "lastAutoFinishCheckAt" = EXCLUDED."lastAutoFinishCheckAt",
        "lastError" = EXCLUDED."lastError",
        "rawJson" = EXCLUDED."rawJson",
        "updatedAt" = NOW()
      RETURNING "id"
    `;

    return NextResponse.json({
      ok: true,
      heartbeatId: rows[0]?.id ?? null,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[DISCORD_HEARTBEAT_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Discord heartbeat 저장 중 오류가 발생했습니다.",
        serverTime: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
