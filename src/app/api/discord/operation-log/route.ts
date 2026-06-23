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

function boolFromEnv(value: string | undefined, fallback = false) {
  if (value == null || value.trim() === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

function numberFromEnv(value: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rawJsonOf(row: Record<string, unknown>) {
  return asRecord(row.rawJson);
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function messageOf(row: Record<string, unknown>) {
  return String(row.message ?? "");
}

function shouldDropNoopOperationLog(row: Record<string, unknown>) {
  if (boolFromEnv(process.env.DISCORD_OPERATION_LOG_KEEP_NOOP, false)) return false;

  const type = String(row.type || "").trim();
  const status = String(row.status || "").trim();
  if (status && status !== "SUCCESS") return false;

  const rawJson = rawJsonOf(row);
  const summary = asRecord(rawJson.summary || row.summary);
  const message = messageOf(row);

  if (type === "AUTO_FINISH_CHECK_SUCCESS") {
    const active = num(summary.active);
    const candidate = num(summary.candidate);
    const finished = num(summary.finished);

    if (summary && Object.keys(summary).length > 0 && active === 0 && candidate === 0 && finished === 0) {
      return true;
    }

    if (/active=0\s+candidate=0\s+finished=0/.test(message)) {
      return true;
    }
  }

  if (type === "RECRUIT_LATE_WARNING_CHECK_SUCCESS") {
    const checkedPartyCount = num(rawJson.checkedPartyCount ?? asRecord(rawJson.result).checkedPartyCount);
    const createdCount = num(rawJson.createdCount ?? asRecord(rawJson.result).createdCount);

    if ((checkedPartyCount === 0 && createdCount === 0) || /checkedParties=0\s+created=0/.test(message)) {
      return true;
    }
  }

  return false;
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

async function pruneOldOperationLogs() {
  const retentionDays = numberFromEnv(process.env.DISCORD_OPERATION_LOG_RETENTION_DAYS, 14, 1, 180);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  await prisma.discordOperationLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      status: { in: ["SUCCESS", "SKIPPED", "INFO"] },
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const incoming = Array.isArray(body.logs) ? body.logs : [body];
  const validRows = incoming
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .slice(0, 100);

  const rows = validRows
    .filter((item) => !shouldDropNoopOperationLog(item))
    .map(normalizeLog);

  const skippedNoopCount = validRows.length - rows.length;

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, count: 0, skippedNoopCount, serverTime: new Date().toISOString() });
  }

  try {
    await ensureDiscordOperationLogTable();
    await prisma.discordOperationLog.createMany({ data: rows });
    await pruneOldOperationLogs().catch((error) => console.error("[DISCORD_OPERATION_LOG_PRUNE_ERROR]", error));
    return NextResponse.json({ ok: true, count: rows.length, skippedNoopCount, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("[DISCORD_OPERATION_LOG_SAVE_ERROR]", error);
    return NextResponse.json({ ok: false, message: "Discord 운영 로그 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
