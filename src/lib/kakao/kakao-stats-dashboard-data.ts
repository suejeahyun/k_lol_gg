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

function getCreatedAt(row: AnyRecord): Date {
  return toDate(row.createdAt ?? row.created_at ?? row.timestamp ?? row.time ?? row.appliedAt ?? row.submittedAt) ?? new Date(0);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeText(value: unknown, fallback = "-") {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
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

function buildEmptyHeatmap() {
  const result: { day: string; hour: number; count: number }[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      result.push({ day: DAY_LABELS[day], hour, count: 0 });
    }
  }
  return result;
}

async function safeFindMany(delegateName: string, args: AnyRecord) {
  const delegate = getDelegate(prisma as any, delegateName);
  if (!delegate) return [];
  try {
    const rows = await delegate.findMany(args);
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const rows = await delegate.findMany({ take: args?.take ?? 2000 });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

function logAction(row: AnyRecord) {
  return safeText(row.action ?? row.type ?? row.event ?? row.eventType ?? row.status, "UNKNOWN");
}

function roomName(row: AnyRecord) {
  return safeText(row.roomName ?? row.chatRoomName ?? row.sourceRoom ?? row.room ?? row.channelName, "미상 방");
}

function senderName(row: AnyRecord) {
  return safeText(row.senderName ?? row.sender ?? row.requester ?? row.createdBy ?? row.name, "미상 발신자");
}

function recruitStatus(row: AnyRecord) {
  return safeText(row.status ?? row.state, "UNKNOWN");
}

function recruitType(row: AnyRecord) {
  return safeText(row.type ?? row.partyType ?? row.kind ?? row.title, "UNKNOWN");
}

function isAutoAction(action: string) {
  const a = action.toUpperCase();
  return a.includes("AUTO") || a.includes("IDLE") || a.includes("RESET");
}

function actionGroup(action: string) {
  const a = action.toUpperCase();
  if (a.includes("CREATE")) return "create";
  if (a.includes("JOIN") || a.includes("APPLY")) return "join";
  if (a.includes("FINISH") || a.includes("CLOSE")) return "finish";
  if (a.includes("RESET")) return "reset";
  if (isAutoAction(a)) return "auto";
  return "other";
}

export type KakaoStatsPayload = Awaited<ReturnType<typeof getKakaoStatsDashboardData>>;

export async function getKakaoStatsDashboardData(input?: { days?: number }) {
  const days = Math.max(1, Math.min(Number(input?.days ?? 30), 365));
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const [logs, recruits, applies, forms] = await Promise.all([
    safeFindMany("recruitPartyLog", { where: { createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: 3000 }),
    safeFindMany("recruitParty", { where: { createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: 2000 }),
    safeFindMany("seasonParticipationPendingApply", { where: { createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: 2000 }),
    safeFindMany("operationForm", { where: { createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: 2000 }),
  ]);

  const allActivities = [
    ...logs.map((row) => ({ ...row, __source: "구인 로그" })),
    ...applies.map((row) => ({ ...row, __source: "참가신청" })),
    ...forms.map((row) => ({ ...row, __source: "운영신청" })),
  ];

  const dailyMap = new Map<string, number>();
  const dailyRecruitMap = new Map<string, number>();
  const dailyAutoMap = new Map<string, number>();
  const dailyStatusMap = new Map<string, Map<string, number>>();
  const statusMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const actionMap = new Map<string, number>();
  const roomMap = new Map<string, number>();
  const senderMap = new Map<string, number>();
  const operationStatusMap = new Map<string, number>();
  const heatmapIndex = new Map<string, number>();

  rangeDays(days).forEach((key) => {
    dailyMap.set(key, 0);
    dailyRecruitMap.set(key, 0);
    dailyAutoMap.set(key, 0);
  });

  for (const row of allActivities) {
    const createdAt = getCreatedAt(row);
    const dKey = dateKey(createdAt);
    const action = logAction(row);
    const hour = createdAt.getHours();
    const day = createdAt.getDay();

    inc(dailyMap, dKey);
    if (isAutoAction(action)) inc(dailyAutoMap, dKey);
    inc(actionMap, action);
    inc(roomMap, roomName(row));
    inc(senderMap, senderName(row));
    inc(heatmapIndex, `${day}:${hour}`);
  }

  for (const row of recruits) {
    const createdAt = getCreatedAt(row);
    const dKey = dateKey(createdAt);
    const status = recruitStatus(row);
    inc(dailyRecruitMap, dKey);
    inc(statusMap, status);
    inc(typeMap, recruitType(row));
    if (!dailyStatusMap.has(dKey)) dailyStatusMap.set(dKey, new Map());
    inc(dailyStatusMap.get(dKey)!, status);
  }

  for (const row of forms) {
    inc(operationStatusMap, safeText(row.status ?? row.state ?? row.type ?? row.category, "UNKNOWN"));
  }

  let cumulative = 0;
  const dailyTrend = Array.from(dailyMap.entries()).map(([date, count]) => {
    cumulative += count;
    return {
      date: date.slice(5),
      count,
      cumulative,
      recruits: dailyRecruitMap.get(date) ?? 0,
      auto: dailyAutoMap.get(date) ?? 0,
    };
  });

  const statusKeys = topFromMap(statusMap, 6).map((item) => item.name);
  const statusStackedByDay: SeriesPoint[] = Array.from(dailyMap.keys()).map((date) => {
    const item: SeriesPoint = { date: date.slice(5) };
    const map = dailyStatusMap.get(date) ?? new Map();
    statusKeys.forEach((key) => {
      item[key] = map.get(key) ?? 0;
    });
    return item;
  });

  const heatmap = buildEmptyHeatmap().map((cell) => {
    const dayIndex = DAY_LABELS.indexOf(cell.day);
    return { ...cell, count: heatmapIndex.get(`${dayIndex}:${cell.hour}`) ?? 0 };
  });

  const roomGroups = new Map<string, { create: number; join: number; finish: number; reset: number; auto: number; other: number }>();
  for (const row of logs) {
    const room = roomName(row);
    if (!roomGroups.has(room)) roomGroups.set(room, { create: 0, join: 0, finish: 0, reset: 0, auto: 0, other: 0 });
    const group = actionGroup(logAction(row)) as keyof NonNullable<ReturnType<typeof roomGroups.get>>;
    roomGroups.get(room)![group] += 1;
  }
  const roomRadar = Array.from(roomGroups.entries())
    .sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))
    .slice(0, 5)
    .flatMap(([room, values]) => [
      { subject: "생성", room, value: values.create },
      { subject: "참가", room, value: values.join },
      { subject: "마감", room, value: values.finish },
      { subject: "초기화", room, value: values.reset },
      { subject: "자동", room, value: values.auto },
    ]);

  const activeRoomByDay = new Map<string, Set<string>>();
  for (const row of logs) {
    const key = dateKey(getCreatedAt(row));
    if (!activeRoomByDay.has(key)) activeRoomByDay.set(key, new Set());
    activeRoomByDay.get(key)!.add(roomName(row));
  }
  const scatter = Array.from(dailyMap.keys()).map((date) => ({
    label: date.slice(5),
    x: dailyMap.get(date) ?? 0,
    y: activeRoomByDay.get(date)?.size ?? 0,
  }));

  const actionTop = topFromMap(actionMap, 10);
  const roomTop = topFromMap(roomMap, 10);
  const senderTop = topFromMap(senderMap, 10);
  const statusTop = topFromMap(statusMap, 10);

  return {
    ok: true,
    days,
    summary: {
      totalActivities: allActivities.length,
      recruitCreates: logs.filter((row) => logAction(row).toUpperCase().includes("CREATE")).length,
      autoFinishes: logs.filter((row) => isAutoAction(logAction(row))).length,
      seasonApply: applies.length,
      reserveApply: applies.filter((row) => String(row.isReserve ?? row.reserve ?? row.type ?? "").includes("예비") || row.isReserve === true).length,
      operationForms: forms.length,
      activeRooms: roomMap.size,
      uniqueSenders: senderMap.size,
    },
    dailyTrend,
    hourlyTrend: Array.from({ length: 24 }).map((_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}시`,
      count: allActivities.filter((row) => getCreatedAt(row).getHours() === hour).length,
    })),
    statusDonut: statusTop.slice(0, 7).map((item) => ({ name: item.name, value: item.count })),
    typeDonut: topFromMap(typeMap, 7).map((item) => ({ name: item.name, value: item.count })),
    actionTop,
    roomTop,
    senderTop,
    roomTreemap: roomTop.map((item) => ({ name: item.name, size: item.count })),
    operationStatusTop: topFromMap(operationStatusMap, 8),
    statusStackedByDay,
    statusStackedKeys: statusKeys,
    heatmap,
    roomRadar,
    scatter,
    funnel: [
      { name: "구인 생성", value: logs.filter((row) => logAction(row).toUpperCase().includes("CREATE")).length },
      { name: "참가/신청", value: logs.filter((row) => ["JOIN", "APPLY"].some((key) => logAction(row).toUpperCase().includes(key))).length + applies.length },
      { name: "진행/충족", value: recruits.filter((row) => ["ACTIVE", "ASSEMBLED", "WAITING"].includes(recruitStatus(row).toUpperCase())).length },
      { name: "마감", value: logs.filter((row) => ["FINISH", "CLOSE"].some((key) => logAction(row).toUpperCase().includes(key))).length },
      { name: "자동처리", value: logs.filter((row) => isAutoAction(logAction(row))).length },
    ],
    recentActivities: allActivities
      .sort((a, b) => getCreatedAt(b).getTime() - getCreatedAt(a).getTime())
      .slice(0, 20)
      .map((row) => ({
        time: getCreatedAt(row).toISOString().replace("T", " ").slice(0, 19),
        source: safeText(row.__source),
        action: logAction(row),
        room: roomName(row),
        sender: senderName(row),
        summary: safeText(row.summary ?? row.message ?? row.memo ?? row.rawText ?? row.title ?? row.name, "-"),
      })),
  };
}
