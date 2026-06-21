export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

function textOrNull(value: unknown, maxLength = 500) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function intOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function ensureDiscordOperationLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DiscordOperationLog" (
      "id" SERIAL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "source" TEXT,
      "endpoint" TEXT,
      "status" TEXT NOT NULL,
      "httpStatus" INTEGER,
      "channelId" TEXT,
      "channelName" TEXT,
      "recruitId" INTEGER,
      "recruitNo" INTEGER,
      "discordId" TEXT,
      "message" TEXT,
      "rawJson" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DiscordOperationLog_type_createdAt_idx" ON "DiscordOperationLog"("type", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DiscordOperationLog_endpoint_createdAt_idx" ON "DiscordOperationLog"("endpoint", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DiscordOperationLog_status_createdAt_idx" ON "DiscordOperationLog"("status", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DiscordOperationLog_channelId_createdAt_idx" ON "DiscordOperationLog"("channelId", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DiscordOperationLog_createdAt_idx" ON "DiscordOperationLog"("createdAt")`);
}

function normalizeLog(row: Record<string, unknown>) {
  const type = textOrNull(row.type, 100) || "UNKNOWN";
  const status = textOrNull(row.status, 60) || "INFO";
  return {
    type,
    source: textOrNull(row.source, 100),
    endpoint: textOrNull(row.endpoint, 220),
    status,
    httpStatus: numberOrNull(row.httpStatus),
    channelId: textOrNull(row.channelId, 100),
    channelName: textOrNull(row.channelName, 220),
    recruitId: intOrNull(row.recruitId),
    recruitNo: intOrNull(row.recruitNo),
    discordId: textOrNull(row.discordId, 100),
    message: textOrNull(row.message, 2000),
    rawJson: row as Prisma.InputJsonValue,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const incoming = Array.isArray(body.logs) ? body.logs : [body];
  const rows = incoming
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .slice(0, 100)
    .map(normalizeLog);

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, message: "저장할 운영 로그가 없습니다." }, { status: 400 });
  }

  try {
    await ensureDiscordOperationLogTable();
    await prisma.discordOperationLog.createMany({ data: rows });
    return NextResponse.json({ ok: true, count: rows.length, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("[DISCORD_OPERATION_LOG_SAVE_ERROR]", error);
    return NextResponse.json({ ok: false, message: "Discord 운영 로그 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
