export const dynamic = "force-dynamic";

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PieItem = { label: string; value: number };
type BarItem = { label: string; value: number };

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function getString(params: Record<string, string | string[] | undefined>, key: string, fallback = "") {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function getNumber(params: Record<string, string | string[] | undefined>, key: string, fallback: number) {
  const value = Number(getString(params, key, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDurationSeconds(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  JOIN: "입장",
  MOVE: "이동",
  LEAVE: "퇴장",
};

const RECRUIT_STATUS_LABELS: Record<string, string> = {
  OPEN: "모집중",
  WAITING: "대기중",
  IN_PROGRESS: "진행중",
  FINISHED: "완료",
  CLOSED: "마감",
  RESET: "초기화",
  CANCELLED: "취소",
};

const MONITOR_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "감시중",
  FINISH_CANDIDATE: "종료 후보",
  AUTO_FINISHED: "자동 마감",
  NO_MATCH: "매칭 없음",
  IDLE: "대기",
};

function labelEventType(value: string | null | undefined) {
  if (!value) return "-";
  return EVENT_TYPE_LABELS[value] ?? value;
}

function labelRecruitStatus(value: string | null | undefined) {
  if (!value) return "-";
  return RECRUIT_STATUS_LABELS[value] ?? value;
}

function labelMonitorStatus(value: string | null | undefined) {
  if (!value) return "미확인";
  return MONITOR_STATUS_LABELS[value] ?? value;
}

function getRawString(rawJson: Prisma.JsonValue | null | undefined, key: string) {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null;
  const value = (rawJson as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getUserLabel(event: {
  discordId: string;
  memberDisplayName?: string | null;
  memberNickname?: string | null;
  discordUsername?: string | null;
  discordGlobalName?: string | null;
  rawJson?: Prisma.JsonValue | null;
  userAccount: null | { userId: string; discordUsername: string | null; discordGlobalName: string | null; discordServerNickname?: string | null };
}) {
  return event.memberDisplayName
    || event.memberNickname
    || getRawString(event.rawJson, "memberDisplayName")
    || getRawString(event.rawJson, "memberNickname")
    || event.userAccount?.discordServerNickname
    || event.userAccount?.discordGlobalName
    || event.userAccount?.discordUsername
    || event.discordGlobalName
    || event.discordUsername
    || getRawString(event.rawJson, "discordGlobalName")
    || getRawString(event.rawJson, "discordUsername")
    || event.userAccount?.userId
    || `미연동 유저 ${event.discordId.slice(-4)}`;
}

function buildQuery(params: Record<string, string | string[] | undefined>, patch: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) query.set(key, normalized);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") query.delete(key);
    else query.set(key, String(value));
  }
  return `?${query.toString()}`;
}

function StatCard(props: { label: string; value: string | number; caption?: string }) {
  return (
    <div className="discord-stat-card">
      <div className="discord-stat-label">{props.label}</div>
      <div className="discord-stat-value">{props.value}</div>
      {props.caption ? <div className="discord-stat-caption">{props.caption}</div> : null}
    </div>
  );
}

function HorizontalBarChart({ title, items, emptyText }: { title: string; items: BarItem[]; emptyText: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="discord-chart-card">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="admin-muted">{emptyText}</p> : null}
      <div className="discord-bars">
        {items.map((item) => (
          <div className="discord-bar-row" key={item.label}>
            <div className="discord-bar-label" title={item.label}>{item.label}</div>
            <div className="discord-bar-track">
              <div className="discord-bar-fill" style={{ width: `${Math.max(4, Math.round((item.value / max) * 100))}%` }} />
            </div>
            <div className="discord-bar-value">{formatNumber(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieChart({ title, items, emptyText }: { title: string; items: PieItem[]; emptyText: string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const palette = ["#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#f59e0b", "#dc2626", "#6b7280"];
  let accumulated = 0;
  const gradient = total > 0
    ? items.map((item, index) => {
      const start = (accumulated / total) * 360;
      accumulated += item.value;
      const end = (accumulated / total) * 360;
      return `${palette[index % palette.length]} ${start}deg ${end}deg`;
    }).join(", ")
    : "#374151 0deg 360deg";

  return (
    <div className="discord-chart-card">
      <h3>{title}</h3>
      {items.length === 0 || total === 0 ? <p className="admin-muted">{emptyText}</p> : (
        <div className="discord-pie-wrap">
          <div className="discord-pie" style={{ background: `conic-gradient(${gradient})` }}>
            <div className="discord-pie-hole">{formatNumber(total)}</div>
          </div>
          <div className="discord-pie-legend">
            {items.map((item, index) => (
              <div className="discord-pie-legend-row" key={item.label}>
                <span className="discord-pie-dot" style={{ background: palette[index % palette.length] }} />
                <span>{item.label}</span>
                <strong>{formatNumber(item.value)} · {percent(item.value, total)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ page, pageSize, total, params }: { page: number; pageSize: number; total: number; params: Record<string, string | string[] | undefined> }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="discord-pagination">
      <Link aria-disabled={page <= 1} className={page <= 1 ? "is-disabled" : ""} href={buildQuery(params, { page: Math.max(1, page - 1) })}>이전</Link>
      <span>{page} / {pageCount}</span>
      <Link aria-disabled={page >= pageCount} className={page >= pageCount ? "is-disabled" : ""} href={buildQuery(params, { page: Math.min(pageCount, page + 1) })}>다음</Link>
    </div>
  );
}

export default async function AdminDiscordMonitorPage(props: PageProps) {
  const params = await props.searchParams ?? {};
  const q = getString(params, "q", "").trim();
  const days = clamp(getNumber(params, "days", 7), 1, 365);
  const page = clamp(getNumber(params, "page", 1), 1, 99999);
  const pageSize = PAGE_SIZE_OPTIONS.includes(getNumber(params, "pageSize", 50)) ? getNumber(params, "pageSize", 50) : 50;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const voiceWhere: Prisma.DiscordVoiceEventWhereInput = {
    occurredAt: { gte: from },
    ...(q ? {
      OR: [
        { discordId: { contains: q, mode: "insensitive" } },
        { channelId: { contains: q, mode: "insensitive" } },
        { previousChannelId: { contains: q, mode: "insensitive" } },
        { channelName: { contains: q, mode: "insensitive" } },
        { previousChannelName: { contains: q, mode: "insensitive" } },
        { categoryName: { contains: q, mode: "insensitive" } },
        { memberDisplayName: { contains: q, mode: "insensitive" } },
        { memberNickname: { contains: q, mode: "insensitive" } },
        { discordUsername: { contains: q, mode: "insensitive" } },
        { discordGlobalName: { contains: q, mode: "insensitive" } },
        { eventType: { contains: q, mode: "insensitive" } },
        { userAccount: { is: { userId: { contains: q, mode: "insensitive" } } } },
        { userAccount: { is: { discordUsername: { contains: q, mode: "insensitive" } } } },
        { userAccount: { is: { discordGlobalName: { contains: q, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const monitorWhere: Prisma.RecruitPartyDiscordMonitorWhereInput = {
    ...(q ? {
      OR: [
        { voiceChannelId: { contains: q, mode: "insensitive" } },
        { status: { contains: q, mode: "insensitive" } },
        { autoFinishReason: { contains: q, mode: "insensitive" } },
        { party: { title: { contains: q, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const [
    voiceTotal,
    recentVoiceEvents,
    eventTypeGroups,
    channelGroups,
    discordUserGroups,
    activeParties,
    monitorTotal,
    recentMonitors,
    monitorStatusGroups,
    recruitStatusGroups,
    finishedAutoCount,
    linkedDiscordUsers,
    durationEvents,
  ] = await Promise.all([
    prisma.discordVoiceEvent.count({ where: voiceWhere }),
    prisma.discordVoiceEvent.findMany({
      where: voiceWhere,
      include: {
        userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } },
      },
      orderBy: [{ occurredAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discordVoiceEvent.groupBy({ by: ["eventType"], where: { occurredAt: { gte: from } }, _count: { _all: true } }),
    prisma.discordVoiceEvent.groupBy({ by: ["channelName"], where: { occurredAt: { gte: from }, channelName: { not: null } }, _count: { _all: true }, orderBy: { _count: { channelName: "desc" } }, take: 10 }),
    prisma.discordVoiceEvent.groupBy({ by: ["discordId"], where: { occurredAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { discordId: "desc" } }, take: 10 }),
    prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS" },
      include: { members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] }, discordMonitor: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 50,
    }),
    prisma.recruitPartyDiscordMonitor.count({ where: monitorWhere }),
    prisma.recruitPartyDiscordMonitor.findMany({
      where: monitorWhere,
      include: { party: { select: { id: true, recruitNo: true, title: true, status: true, maxMembers: true, updatedAt: true } } },
      orderBy: [{ updatedAt: "desc" }],
      take: 30,
    }),
    prisma.recruitPartyDiscordMonitor.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.recruitParty.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.recruitPartyDiscordMonitor.count({ where: { autoFinishedAt: { not: null }, updatedAt: { gte: from } } }),
    prisma.userAccount.count({ where: { discordId: { not: null } } }),
    prisma.discordVoiceEvent.findMany({
      where: { occurredAt: { gte: from } },
      include: { userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } } },
      orderBy: [{ occurredAt: "asc" }],
      take: 5000,
    }),
  ]);

  const topDiscordIds = discordUserGroups.map((item) => item.discordId);
  const topUsers = topDiscordIds.length > 0
    ? await prisma.userAccount.findMany({ where: { discordId: { in: topDiscordIds } }, select: { discordId: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } })
    : [];
  const latestTopEvents = topDiscordIds.length > 0
    ? await prisma.discordVoiceEvent.findMany({
      where: { discordId: { in: topDiscordIds } },
      select: { discordId: true, memberDisplayName: true, memberNickname: true, discordUsername: true, discordGlobalName: true, rawJson: true },
      orderBy: [{ occurredAt: "desc" }],
      take: 200,
    })
    : [];
  const userMap = new Map(topUsers.map((user) => [user.discordId, user.discordServerNickname || user.discordGlobalName || user.discordUsername || user.userId]));
  for (const event of latestTopEvents) {
    if (!userMap.has(event.discordId)) {
      const label = event.memberDisplayName
        || event.memberNickname
        || getRawString(event.rawJson, "memberDisplayName")
        || getRawString(event.rawJson, "memberNickname")
        || event.discordGlobalName
        || event.discordUsername
        || getRawString(event.rawJson, "discordGlobalName")
        || getRawString(event.rawJson, "discordUsername");
      if (label) userMap.set(event.discordId, label);
    }
  }

  const eventTypeChart = eventTypeGroups.map((item) => ({ label: labelEventType(item.eventType), value: item._count._all }));
  const channelChart = channelGroups.map((item) => ({ label: item.channelName ?? "알 수 없는 채널", value: item._count._all }));
  const userChart = discordUserGroups.map((item) => ({ label: userMap.get(item.discordId) ?? `미연동 유저 ${item.discordId.slice(-4)}`, value: item._count._all }));
  const monitorPie = monitorStatusGroups.map((item) => ({ label: labelMonitorStatus(item.status), value: item._count._all }));
  const recruitPie = recruitStatusGroups.map((item) => ({ label: labelRecruitStatus(String(item.status)), value: item._count._all }));


  type VoiceSession = {
    discordId: string;
    label: string;
    channelId: string;
    channelName: string;
    start: Date;
    end: Date;
  };

  const openSessions = new Map<string, { channelId: string; channelName: string; start: Date; label: string }>();
  const sessions: VoiceSession[] = [];
  const labelByDiscordId = new Map<string, string>();

  function labelForDurationEvent(event: (typeof durationEvents)[number]) {
    return getUserLabel(event);
  }

  function closeSession(discordId: string, end: Date) {
    const open = openSessions.get(discordId);
    if (!open) return;
    if (end > open.start) {
      sessions.push({ discordId, label: open.label, channelId: open.channelId, channelName: open.channelName, start: open.start, end });
    }
    openSessions.delete(discordId);
  }

  for (const event of durationEvents) {
    const label = labelForDurationEvent(event);
    labelByDiscordId.set(event.discordId, label);
    const currentChannelId = event.channelId || "";
    const previousChannelId = event.previousChannelId || "";
    const currentChannelName = event.channelName || getRawString(event.rawJson, "channelName") || currentChannelId || "알 수 없는 음성방";
    const previousChannelName = event.previousChannelName || getRawString(event.rawJson, "previousChannelName") || previousChannelId || "알 수 없는 음성방";

    if (event.eventType === "JOIN") {
      if (currentChannelId) openSessions.set(event.discordId, { channelId: currentChannelId, channelName: currentChannelName, start: event.occurredAt, label });
    } else if (event.eventType === "MOVE") {
      closeSession(event.discordId, event.occurredAt);
      if (currentChannelId) openSessions.set(event.discordId, { channelId: currentChannelId, channelName: currentChannelName, start: event.occurredAt, label });
    } else if (event.eventType === "LEAVE") {
      if (!openSessions.has(event.discordId) && previousChannelId) {
        openSessions.set(event.discordId, { channelId: previousChannelId, channelName: previousChannelName, start: from, label });
      }
      closeSession(event.discordId, event.occurredAt);
    }
  }

  for (const [discordId, open] of openSessions.entries()) {
    sessions.push({ discordId, label: open.label, channelId: open.channelId, channelName: open.channelName, start: open.start, end: new Date() });
  }

  const durationByUser = new Map<string, { label: string; seconds: number }>();
  for (const session of sessions) {
    const seconds = Math.max(0, Math.floor((session.end.getTime() - session.start.getTime()) / 1000));
    const prev = durationByUser.get(session.discordId) || { label: session.label, seconds: 0 };
    prev.seconds += seconds;
    prev.label = session.label || prev.label;
    durationByUser.set(session.discordId, prev);
  }

  const stayTop10 = Array.from(durationByUser.entries())
    .map(([discordId, item]) => ({ discordId, label: item.label, seconds: item.seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  const targetIds = q ? Array.from(labelByDiscordId.entries())
    .filter(([, label]) => label.toLowerCase().includes(q.toLowerCase()))
    .map(([discordId]) => discordId) : [];
  const targetIdSet = new Set(targetIds);
  const targetSessions = sessions.filter((session) => targetIdSet.has(session.discordId));
  const coPresence = new Map<string, { label: string; seconds: number }>();

  for (const target of targetSessions) {
    for (const other of sessions) {
      if (other.discordId === target.discordId) continue;
      if (other.channelId !== target.channelId) continue;
      const overlapMs = Math.min(target.end.getTime(), other.end.getTime()) - Math.max(target.start.getTime(), other.start.getTime());
      if (overlapMs <= 0) continue;
      const prev = coPresence.get(other.discordId) || { label: other.label, seconds: 0 };
      prev.seconds += Math.floor(overlapMs / 1000);
      prev.label = other.label || prev.label;
      coPresence.set(other.discordId, prev);
    }
  }

  const coPresenceTop10 = Array.from(coPresence.entries())
    .map(([discordId, item]) => ({ discordId, label: item.label, seconds: item.seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  const activeCandidateCount = activeParties.filter((party) => party.discordMonitor?.status === "FINISH_CANDIDATE").length;
  const activeAutoFinishedCount = activeParties.filter((party) => party.discordMonitor?.status === "AUTO_FINISHED").length;

  return (
    <main className="admin-page discord-monitor-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Discord 상세 로그</h1>
          <p className="admin-page__description">
            음성방 입장·이동·퇴장, 구인 자동 ㅉ, 채널별·유저별 통계를 메인 화면에서 확인합니다.
          </p>
        </div>
        <div className="admin-actions">
          <Link className="admin-button" href="/admin/discord/settings">운영 시스템 설정</Link>
          <Link className="admin-button admin-button--secondary" href="/admin/discord">새로고침</Link>
        </div>
      </div>

      <section className="admin-card discord-help-card">
        <div className="admin-section-head">
          <div>
            <h2>기능 설명</h2>
            <p className="admin-muted">이 화면은 운영 확인용 상세 로그입니다. 설정 변경은 우측 상단의 운영 시스템 설정에서 처리합니다.</p>
          </div>
        </div>
        <div className="discord-help-grid">
          <div><strong>음성 이벤트</strong><span>Discord 음성방 입장·이동·퇴장 원본 기록입니다.</span></div>
          <div><strong>진행중 구인 자동 ㅉ 상태</strong><span>구인별 감시 채널, 참가자 잔류, 자동 마감 후보 여부를 확인합니다.</span></div>
          <div><strong>최근 디스코드 모니터 기록</strong><span>자동 마감 후보, 자동 마감 완료, 비참가자 잔류 수를 확인합니다.</span></div>
          <div><strong>차트/통계</strong><span>최근 기간 기준 이벤트 비율, 채널별 이벤트, 유저별 이벤트를 보여줍니다.</span></div>
          <div><strong>체류시간 TOP 10</strong><span>선택 기간 동안 음성방에 오래 머문 유저를 계산합니다.</span></div>
          <div><strong>같이 있던 사람</strong><span>검색어에 유저 이름을 입력하면 같은 음성방에 가장 오래 같이 있던 사람 TOP 10을 보여줍니다.</span></div>
          <div><strong>운영 시스템 설정</strong><span>자동 ㅉ, 감시 채널, 로그 채널, 역할 ID 등 봇 설정을 관리합니다.</span></div>
        </div>
      </section>

      <form className="discord-filter-card" method="get">
        <label>
          검색
          <input name="q" defaultValue={q} placeholder="유저명, 서버 닉네임, 채널명, Discord ID, 상태 검색" />
        </label>
        <label>
          기간
          <select name="days" defaultValue={String(days)}>
            <option value="1">최근 1일</option>
            <option value="3">최근 3일</option>
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="90">최근 90일</option>
          </select>
        </label>
        <label>
          페이지 크기
          <select name="pageSize" defaultValue={String(pageSize)}>
            {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}개</option>)}
          </select>
        </label>
        <button type="submit">조회</button>
        <Link href="/admin/discord">초기화</Link>
      </form>

      <section className="discord-stat-grid">
        <StatCard label="음성 이벤트" value={formatNumber(voiceTotal)} caption={`최근 ${days}일 기준`} />
        <StatCard label="Discord 연동 계정" value={formatNumber(linkedDiscordUsers)} caption="UserAccount 기준" />
        <StatCard label="진행중 구인" value={formatNumber(activeParties.length)} caption="카카오 구인 상태" />
        <StatCard label="자동 ㅉ 완료" value={formatNumber(finishedAutoCount)} caption={`최근 ${days}일 기준`} />
        <StatCard label="자동 ㅉ 후보" value={formatNumber(activeCandidateCount)} caption="현재 진행중 구인" />
        <StatCard label="마감 처리 감지" value={formatNumber(activeAutoFinishedCount)} caption="현재 진행중 목록 기준" />
      </section>

      <section className="discord-chart-grid">
        <PieChart title="음성 이벤트 비율" items={eventTypeChart} emptyText="이벤트 데이터가 없습니다." />
        <PieChart title="구인 상태 분포" items={recruitPie} emptyText="구인 데이터가 없습니다." />
        <HorizontalBarChart title="채널별 이벤트 TOP 10" items={channelChart} emptyText="채널 이벤트가 없습니다." />
        <HorizontalBarChart title="유저별 이벤트 TOP 10" items={userChart} emptyText="유저 이벤트가 없습니다." />
        <HorizontalBarChart title="체류시간 TOP 10" items={stayTop10.map((item) => ({ label: item.label, value: Math.max(1, Math.round(item.seconds / 60)) }))} emptyText="체류시간 데이터가 없습니다." />
        <HorizontalBarChart title={q ? `검색 유저와 같이 있던 사람 TOP 10` : "같이 있던 사람 TOP 10"} items={q ? coPresenceTop10.map((item) => ({ label: `${item.label} · ${formatDurationSeconds(item.seconds)}`, value: Math.max(1, Math.round(item.seconds / 60)) })) : []} emptyText="검색창에 유저 이름을 입력하면 같이 있던 사람을 계산합니다." />
        <PieChart title="디스코드 모니터 상태" items={monitorPie} emptyText="모니터 데이터가 없습니다." />
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>진행중 구인 자동 ㅉ 상태</h2>
            <p className="admin-muted">유저에게는 상세 로그를 공개하지 않고 운영진만 확인하는 화면입니다.</p>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table discord-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>제목</th>
                <th>참가</th>
                <th>디코 상태</th>
                <th>감지 채널</th>
                <th>참가자 잔류</th>
                <th>비참가자</th>
                <th>후보 시작</th>
                <th>마지막 확인</th>
              </tr>
            </thead>
            <tbody>
              {activeParties.length === 0 ? (
                <tr><td colSpan={9}>진행중 구인이 없습니다.</td></tr>
              ) : activeParties.map((party) => {
                const activeMembers = party.members.filter((member) => member.name.trim() !== "" && !member.isSubstitute).length;
                const monitor = party.discordMonitor;
                return (
                  <tr key={party.id}>
                    <td>#{party.recruitNo}</td>
                    <td className="discord-cell-strong">{party.title}</td>
                    <td>{activeMembers}/{party.maxMembers}</td>
                    <td><span className={`discord-badge discord-badge--${(monitor?.status ?? "none").toLowerCase()}`}>{labelMonitorStatus(monitor?.status)}</span></td>
                    <td className="discord-mono">{monitor?.voiceChannelId ?? "-"}</td>
                    <td>{monitor ? `${monitor.lastPresentExpectedCount}/${monitor.lastExpectedCount}` : "-"}</td>
                    <td>{monitor?.lastNonParticipantCount ?? "-"}</td>
                    <td>{formatDate(monitor?.finishCandidateStartedAt)}</td>
                    <td>{formatDate(monitor?.lastScannedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>최근 디스코드 모니터 기록</h2>
            <p className="admin-muted">자동 마감 후보, 자동 마감 완료, 비참가자 잔류 수를 확인합니다.</p>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table discord-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>제목</th>
                <th>구인상태</th>
                <th>디코상태</th>
                <th>채널</th>
                <th>잔류</th>
                <th>비참가자</th>
                <th>자동마감</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {recentMonitors.length === 0 ? (
                <tr><td colSpan={9}>모니터 기록이 없습니다.</td></tr>
              ) : recentMonitors.map((monitor) => (
                <tr key={monitor.id}>
                  <td>#{monitor.party.recruitNo}</td>
                  <td className="discord-cell-strong">{monitor.party.title}</td>
                  <td>{labelRecruitStatus(String(monitor.party.status))}</td>
                  <td><span className={`discord-badge discord-badge--${monitor.status.toLowerCase()}`}>{labelMonitorStatus(monitor.status)}</span></td>
                  <td className="discord-mono">{monitor.voiceChannelId ?? "-"}</td>
                  <td>{monitor.lastPresentExpectedCount}/{monitor.lastExpectedCount}</td>
                  <td>{monitor.lastNonParticipantCount}</td>
                  <td>{formatDate(monitor.autoFinishedAt)}</td>
                  <td className="discord-reason">{monitor.autoFinishReason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="discord-result-count">모니터 검색 결과 {formatNumber(monitorTotal)}건</p>
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>음성 이벤트 로그</h2>
            <p className="admin-muted">입장·이동·퇴장 원본 로그입니다. 운영진 전용으로만 사용하세요.</p>
          </div>
          <Pagination page={page} pageSize={pageSize} total={voiceTotal} params={params} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table discord-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>이벤트</th>
                <th>유저</th>
                <th>현재 채널</th>
                <th>이전 채널</th>
              </tr>
            </thead>
            <tbody>
              {recentVoiceEvents.length === 0 ? (
                <tr><td colSpan={5}>음성 이벤트 기록이 없습니다.</td></tr>
              ) : recentVoiceEvents.map((event) => {
                const channelName = event.channelName || getRawString(event.rawJson, "channelName");
                const previousChannelName = event.previousChannelName || getRawString(event.rawJson, "previousChannelName");
                const currentChannelLabel = channelName || getRawString(event.rawJson, "channelName") || "-";
                const previousChannelLabel = previousChannelName || getRawString(event.rawJson, "previousChannelName") || "-";
                return (
                  <tr key={event.id}>
                    <td>{formatDate(event.occurredAt)}</td>
                    <td><span className={`discord-event discord-event--${event.eventType.toLowerCase()}`}>{labelEventType(event.eventType)}</span></td>
                    <td>{getUserLabel(event)}</td>
                    <td>{currentChannelLabel}</td>
                    <td>{previousChannelLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={voiceTotal} params={params} />
      </section>

      <style>{`
        .discord-monitor-page { --discord-card: rgba(15, 23, 42, 0.72); --discord-line: rgba(148, 163, 184, 0.22); }
        .discord-filter-card { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 150px auto auto; gap: 12px; align-items: end; padding: 16px; border: 1px solid var(--discord-line); border-radius: 18px; background: var(--discord-card); margin-bottom: 16px; }
        .discord-filter-card label { display: grid; gap: 6px; font-size: 12px; color: #94a3b8; }
        .discord-filter-card input, .discord-filter-card select { min-height: 40px; border: 1px solid var(--discord-line); border-radius: 12px; background: rgba(2, 6, 23, 0.6); color: #e5e7eb; padding: 0 12px; }
        .discord-filter-card button, .discord-filter-card a { min-height: 40px; border-radius: 12px; border: 1px solid rgba(129, 140, 248, 0.6); background: rgba(79, 70, 229, 0.18); color: #c7d2fe; display: inline-flex; align-items: center; justify-content: center; padding: 0 14px; text-decoration: none; }
        .discord-stat-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
        .discord-stat-card { padding: 16px; border: 1px solid var(--discord-line); border-radius: 18px; background: linear-gradient(180deg, rgba(30,41,59,0.86), rgba(15,23,42,0.74)); }
        .discord-stat-label { font-size: 12px; color: #94a3b8; }
        .discord-stat-value { margin-top: 8px; font-size: 28px; font-weight: 800; color: #f8fafc; }
        .discord-stat-caption { margin-top: 4px; font-size: 12px; color: #64748b; }
        .discord-chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
        .discord-chart-card { padding: 18px; border: 1px solid var(--discord-line); border-radius: 18px; background: var(--discord-card); min-height: 240px; }
        .discord-chart-card h3 { margin: 0 0 14px; color: #f8fafc; font-size: 16px; }
        .discord-bars { display: grid; gap: 10px; }
        .discord-bar-row { display: grid; grid-template-columns: 150px 1fr 52px; gap: 10px; align-items: center; }
        .discord-bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; font-size: 12px; }
        .discord-bar-track { height: 10px; border-radius: 999px; background: rgba(51,65,85,0.8); overflow: hidden; }
        .discord-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6366f1, #22d3ee); }
        .discord-bar-value { color: #e5e7eb; text-align: right; font-size: 12px; }
        .discord-pie-wrap { display: grid; grid-template-columns: 160px 1fr; gap: 18px; align-items: center; }
        .discord-pie { width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
        .discord-pie-hole { width: 82px; height: 82px; border-radius: 50%; background: #0f172a; display: grid; place-items: center; color: #f8fafc; font-weight: 800; }
        .discord-pie-legend { display: grid; gap: 8px; }
        .discord-pie-legend-row { display: grid; grid-template-columns: 14px 1fr auto; gap: 8px; align-items: center; font-size: 12px; color: #cbd5e1; }
        .discord-pie-dot { width: 10px; height: 10px; border-radius: 50%; }
        .discord-table th, .discord-table td { white-space: nowrap; }
        .discord-cell-strong { font-weight: 700; color: #e5e7eb; }
        .discord-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #cbd5e1; }
        .discord-reason { max-width: 320px; white-space: normal !important; color: #cbd5e1; }
        .discord-badge, .discord-event { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 800; border: 1px solid rgba(148,163,184,0.22); }
        .discord-badge--active, .discord-event--join { background: rgba(34,197,94,0.14); color: #86efac; }
        .discord-badge--finish_candidate, .discord-event--move { background: rgba(245,158,11,0.14); color: #fcd34d; }
        .discord-badge--auto_finished, .discord-event--leave { background: rgba(99,102,241,0.14); color: #c4b5fd; }
        .discord-badge--none { background: rgba(100,116,139,0.14); color: #cbd5e1; }
        .discord-pagination { display: flex; gap: 10px; align-items: center; justify-content: flex-end; color: #cbd5e1; }
        .discord-pagination a { border: 1px solid var(--discord-line); border-radius: 10px; padding: 6px 10px; color: #c7d2fe; text-decoration: none; }
        .discord-pagination a.is-disabled { opacity: 0.4; pointer-events: none; }
        .discord-result-count { margin: 12px 0 0; color: #94a3b8; font-size: 12px; }
        .discord-help-card { margin-bottom: 16px; }
        .discord-help-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .discord-help-grid div { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--discord-line); border-radius: 14px; background: rgba(2, 6, 23, 0.34); }
        .discord-help-grid strong { color: #e5e7eb; font-size: 13px; }
        .discord-help-grid span { color: #94a3b8; font-size: 12px; line-height: 1.55; }
        @media (max-width: 1100px) { .discord-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .discord-chart-grid { grid-template-columns: 1fr; } .discord-filter-card { grid-template-columns: 1fr; } .discord-help-grid { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}
