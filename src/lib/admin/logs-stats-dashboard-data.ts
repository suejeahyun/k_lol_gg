import { prisma } from "@/lib/prisma/client";

type AnyRecord = Record<string, any>;

type SeriesPoint = Record<string, string | number>;

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getDelegate(db: any, name: string) {
  const delegate = db?.[name];
  if (!delegate || typeof delegate.findMany !== "function") return null;
  return delegate;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeText(value: unknown, fallback = "-") {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
}

function getCreatedAt(row: AnyRecord): Date {
  return toDate(row.createdAt ?? row.created_at ?? row.timestamp ?? row.time ?? row.loggedAt) ?? new Date(0);
}

function getAction(row: AnyRecord) {
  return safeText(row.action ?? row.type ?? row.event ?? row.eventType ?? row.operation, "UNKNOWN");
}

function getTargetType(row: AnyRecord) {
  return safeText(row.targetType ?? row.target ?? row.entityType ?? row.model ?? row.resource, "UNKNOWN");
}

function getActor(row: AnyRecord) {
  return safeText(row.actorName ?? row.actor ?? row.adminName ?? row.userName ?? row.actorUserId ?? row.userId ?? row.createdBy, "SYSTEM");
}

function getIp(row: AnyRecord) {
  return safeText(row.ip ?? row.ipAddress ?? row.remoteAddr ?? row.clientIp, "-");
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function topFromMap(map: Map<string, number>, limit = 10) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function rangeDays(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }).map((_, index) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - index));
    return dateKey(d);
  });
}

function actionGroup(action: string) {
  const a = action.toUpperCase();
  if (a.includes("CREATE") || a.includes("NEW") || a.includes("APPLY")) return "create";
  if (a.includes("UPDATE") || a.includes("EDIT") || a.includes("SYNC")) return "update";
  if (a.includes("DELETE") || a.includes("REMOVE") || a.includes("DEACTIVATE")) return "delete";
  if (a.includes("LOGIN") || a.includes("AUTH")) return "login";
  if (a.includes("CSV") || a.includes("DOWNLOAD") || a.includes("EXPORT")) return "download";
  return "other";
}

function buildEmptyHeatmap() {
  const result: { day: string; hour: number; count: number }[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      result.push({ day: DAY_LABELS[day], hour, count: 0 });
    }
  }
  return result;
}

export type AdminLogsStatsPayload = Awaited<ReturnType<typeof getAdminLogsStatsDashboardData>>;

export async function getAdminLogsStatsDashboardData(input?: { days?: number }) {
  const days = Math.max(1, Math.min(Number(input?.days ?? 30), 365));
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const delegate = getDelegate(prisma as any, "adminLog");
  if (!delegate) {
    return buildEmptyAdminLogsStats(days, "AdminLog delegate가 없습니다.");
  }

  let logs: AnyRecord[] = [];
  let allTimeTotal = 0;

  try {
    const [rows, total] = await Promise.all([
      delegate.findMany({
        where: { createdAt: { gte: from } },
        orderBy: { createdAt: "desc" },
        take: 3000,
      }),
      typeof delegate.count === "function" ? delegate.count().catch(() => 0) : Promise.resolve(0),
    ]);
    logs = Array.isArray(rows) ? rows : [];
    allTimeTotal = Number(total || 0);
  } catch {
    try {
      const rows = await delegate.findMany({ orderBy: { createdAt: "desc" }, take: 3000 });
      logs = Array.isArray(rows) ? rows : [];
      allTimeTotal = logs.length;
    } catch {
      return buildEmptyAdminLogsStats(days, "AdminLog 조회에 실패했습니다.");
    }
  }

  const now = Date.now();
  const last24h = logs.filter((row) => now - getCreatedAt(row).getTime() <= 24 * 60 * 60 * 1000).length;

  const dailyMap = new Map<string, number>();
  const hourlyMap = new Map<string, number>();
  const actionMap = new Map<string, number>();
  const targetMap = new Map<string, number>();
  const actorMap = new Map<string, number>();
  const ipMap = new Map<string, number>();
  const heatmapIndex = new Map<string, number>();
  const actionDayMap = new Map<string, Map<string, number>>();
  const dayActorSet = new Map<string, Set<string>>();
  const dayActionSet = new Map<string, Set<string>>();

  rangeDays(days).forEach((key) => dailyMap.set(key, 0));

  for (const row of logs) {
    const createdAt = getCreatedAt(row);
    const dKey = dateKey(createdAt);
    const action = getAction(row);
    const targetType = getTargetType(row);
    const actor = getActor(row);
    const ip = getIp(row);
    const hour = createdAt.getHours();
    const day = createdAt.getDay();

    inc(dailyMap, dKey);
    inc(hourlyMap, String(hour).padStart(2, "0"));
    inc(actionMap, action);
    inc(targetMap, targetType);
    inc(actorMap, actor);
    inc(ipMap, ip);
    inc(heatmapIndex, `${day}:${hour}`);

    if (!actionDayMap.has(dKey)) actionDayMap.set(dKey, new Map());
    inc(actionDayMap.get(dKey)!, action);

    if (!dayActorSet.has(dKey)) dayActorSet.set(dKey, new Set());
    dayActorSet.get(dKey)!.add(actor);

    if (!dayActionSet.has(dKey)) dayActionSet.set(dKey, new Set());
    dayActionSet.get(dKey)!.add(action);
  }

  let cumulative = 0;
  const dailyTrend = Array.from(dailyMap.entries()).map(([date, count]) => {
    cumulative += count;
    return { date: date.slice(5), count, cumulative };
  });

  const hourlyTrend = Array.from({ length: 24 }).map((_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}시`,
    count: hourlyMap.get(String(hour).padStart(2, "0")) ?? 0,
  }));

  const topActions = topFromMap(actionMap, 6).map((item) => item.name);
  const actionStackedByDay: SeriesPoint[] = Array.from(dailyMap.keys()).map((date) => {
    const item: SeriesPoint = { date: date.slice(5) };
    const map = actionDayMap.get(date) ?? new Map();
    topActions.forEach((action) => {
      item[action] = map.get(action) ?? 0;
    });
    return item;
  });

  const heatmap = buildEmptyHeatmap().map((cell) => {
    const dayIndex = DAY_LABELS.indexOf(cell.day);
    return { ...cell, count: heatmapIndex.get(`${dayIndex}:${cell.hour}`) ?? 0 };
  });

  const actorGroups = new Map<string, { create: number; update: number; delete: number; login: number; download: number; other: number }>();
  for (const row of logs) {
    const actor = getActor(row);
    if (!actorGroups.has(actor)) actorGroups.set(actor, { create: 0, update: 0, delete: 0, login: 0, download: 0, other: 0 });
    const group = actionGroup(getAction(row)) as keyof NonNullable<ReturnType<typeof actorGroups.get>>;
    actorGroups.get(actor)![group] += 1;
  }
  const actorRadar = Array.from(actorGroups.entries())
    .sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))
    .slice(0, 6)
    .flatMap(([actor, values]) => [
      { subject: "생성", actor, value: values.create },
      { subject: "수정", actor, value: values.update },
      { subject: "삭제", actor, value: values.delete },
      { subject: "로그인", actor, value: values.login },
      { subject: "다운로드", actor, value: values.download },
    ]);

  const scatter = Array.from(dailyMap.keys()).map((date) => ({
    label: date.slice(5),
    x: dailyMap.get(date) ?? 0,
    y: dayActorSet.get(date)?.size ?? 0,
    z: dayActionSet.get(date)?.size ?? 0,
  }));

  const actionTop = topFromMap(actionMap, 10);
  const targetTop = topFromMap(targetMap, 10);
  const actorTop = topFromMap(actorMap, 10);
  const ipTop = topFromMap(ipMap, 10);

  return {
    ok: true,
    notice: "",
    days,
    summary: {
      total: logs.length,
      last24h,
      uniqueActors: actorMap.size,
      actionTypes: actionMap.size,
      targetTypes: targetMap.size,
      allTimeTotal,
    },
    dailyTrend,
    hourlyTrend,
    actionTop,
    targetTop,
    actorTop,
    ipTop,
    actionDonut: actionTop.slice(0, 7).map((item) => ({ name: item.name, value: item.count })),
    targetDonut: targetTop.slice(0, 7).map((item) => ({ name: item.name, value: item.count })),
    actionStackedByDay,
    stackedKeys: topActions,
    heatmap,
    actorRadar,
    scatter,
    recentLogs: logs.slice(0, 20).map((row) => ({
      id: safeText(row.id),
      time: getCreatedAt(row).toISOString().replace("T", " ").slice(0, 19),
      action: getAction(row),
      targetType: getTargetType(row),
      actor: getActor(row),
      ip: getIp(row),
      summary: safeText(row.summary ?? row.message ?? row.description ?? row.detail ?? row.targetId, "-"),
    })),
  };
}

function buildEmptyAdminLogsStats(days: number, notice = "") {
  return {
    ok: true,
    notice,
    days,
    summary: { total: 0, last24h: 0, uniqueActors: 0, actionTypes: 0, targetTypes: 0, allTimeTotal: 0 },
    dailyTrend: rangeDays(days).map((date) => ({ date: date.slice(5), count: 0, cumulative: 0 })),
    hourlyTrend: Array.from({ length: 24 }).map((_, hour) => ({ hour: `${String(hour).padStart(2, "0")}시`, count: 0 })),
    actionTop: [],
    targetTop: [],
    actorTop: [],
    ipTop: [],
    actionDonut: [],
    targetDonut: [],
    actionStackedByDay: [],
    stackedKeys: [],
    heatmap: buildEmptyHeatmap(),
    actorRadar: [],
    scatter: [],
    recentLogs: [],
  };
}
