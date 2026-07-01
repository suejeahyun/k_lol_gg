export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

function getNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function getString(value: string | null) {
  return String(value || "").trim();
}

export async function GET(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const url = new URL(req.url);
  const q = getString(url.searchParams.get("q"));
  const action = getString(url.searchParams.get("action"));
  const targetType = getString(url.searchParams.get("targetType"));
  const limit = getNumber(url.searchParams.get("limit"), 50, 1, 200);
  const days = getNumber(url.searchParams.get("days"), 30, 1, 3650);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const and: Prisma.AdminLogWhereInput[] = [{ createdAt: { gte: from } }];

  if (q) {
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
        { actorUserId: { contains: q, mode: "insensitive" } },
        { actorType: { contains: q, mode: "insensitive" } },
        { targetType: { contains: q, mode: "insensitive" } },
        { ipAddress: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (action) and.push({ action });
  if (targetType) and.push({ targetType });

  const where: Prisma.AdminLogWhereInput = and.length ? { AND: and } : {};

  const [logs, total, rangeTotal, allRecent] = await Promise.all([
    prisma.adminLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        message: true,
        actorId: true,
        actorType: true,
        actorUserId: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    }),
    prisma.adminLog.count({ where }),
    prisma.adminLog.count({ where: { createdAt: { gte: from } } }),
    prisma.adminLog.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { action: true, targetType: true, actorType: true, createdAt: true },
    }),
  ]);

  const actionCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();
  const actorCounts = new Map<string, number>();
  const last24From = Date.now() - 24 * 60 * 60 * 1000;
  let last24Count = 0;

  for (const log of allRecent) {
    actionCounts.set(log.action || "UNKNOWN", (actionCounts.get(log.action || "UNKNOWN") || 0) + 1);
    targetCounts.set(log.targetType || "미지정", (targetCounts.get(log.targetType || "미지정") || 0) + 1);
    actorCounts.set(log.actorType || "미지정", (actorCounts.get(log.actorType || "미지정") || 0) + 1);
    if (new Date(log.createdAt).getTime() >= last24From) last24Count += 1;
  }

  const toItems = (map: Map<string, number>) => Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return NextResponse.json({
    ok: true,
    logs,
    total,
    summary: {
      days,
      rangeTotal,
      last24Count,
      actionCounts: toItems(actionCounts),
      targetCounts: toItems(targetCounts),
      actorCounts: toItems(actorCounts),
    },
  });
}
