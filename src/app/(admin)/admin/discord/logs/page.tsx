import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import styles from "../DiscordReadable.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE_OPTIONS = [20, 30, 50];

function getString(params: Record<string, string | string[] | undefined>, key: string, fallback = "") {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}
function getNumber(params: Record<string, string | string[] | undefined>, key: string, fallback: number) {
  const value = Number(getString(params, key, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function formatDateParts(value: Date | string | null | undefined) {
  if (!value) return { dateText: "-", timeText: "" };
  const date = new Date(value);
  return {
    dateText: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date),
    timeText: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date),
  };
}
function labelEventType(value: string | null | undefined) {
  return ({ JOIN: "입장", MOVE: "이동", LEAVE: "퇴장", SNAPSHOT: "스냅샷" } as Record<string, string>)[value || ""] || value || "-";
}
function eventClass(value: string | null | undefined) {
  if (value === "JOIN") return styles.badgeJoin;
  if (value === "LEAVE") return styles.badgeLeave;
  if (value === "MOVE") return styles.badgeMove;
  return styles.badgeNeutral;
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
function getRawString(rawJson: Prisma.JsonValue | null | undefined, key: string) {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null;
  const value = (rawJson as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}
function getUserLabel(event: { discordId: string; memberDisplayName?: string | null; memberNickname?: string | null; discordUsername?: string | null; discordGlobalName?: string | null; rawJson?: Prisma.JsonValue | null; userAccount: null | { userId: string; discordUsername: string | null; discordGlobalName: string | null; discordServerNickname?: string | null } }) {
  return event.memberDisplayName || event.memberNickname || getRawString(event.rawJson, "memberDisplayName") || getRawString(event.rawJson, "memberNickname") || event.userAccount?.discordServerNickname || event.userAccount?.discordGlobalName || event.userAccount?.discordUsername || event.discordGlobalName || event.discordUsername || getRawString(event.rawJson, "discordGlobalName") || getRawString(event.rawJson, "discordUsername") || event.userAccount?.userId || `Discord 사용자 ${event.discordId.slice(-4)}`;
}

export default async function DiscordLogsPage(props: PageProps) {
  const params = await props.searchParams ?? {};
  const q = getString(params, "q", "").trim();
  const days = clamp(getNumber(params, "days", 7), 1, 365);
  const page = clamp(getNumber(params, "page", 1), 1, 99999);
  const requestedPageSize = getNumber(params, "pageSize", 50);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize) ? requestedPageSize : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const voiceWhere: Prisma.DiscordVoiceEventWhereInput = {
    occurredAt: { gte: from },
    ...(q ? { OR: [
      { discordId: { contains: q, mode: "insensitive" } },
      { channelName: { contains: q, mode: "insensitive" } },
      { previousChannelName: { contains: q, mode: "insensitive" } },
      { memberDisplayName: { contains: q, mode: "insensitive" } },
      { memberNickname: { contains: q, mode: "insensitive" } },
      { discordUsername: { contains: q, mode: "insensitive" } },
      { discordGlobalName: { contains: q, mode: "insensitive" } },
      { eventType: { contains: q, mode: "insensitive" } },
      { userAccount: { is: { userId: { contains: q, mode: "insensitive" } } } },
    ] } : {}),
  };

  const [voiceTotal, events, joinCount, leaveCount, moveCount] = await Promise.all([
    prisma.discordVoiceEvent.count({ where: voiceWhere }),
    prisma.discordVoiceEvent.findMany({
      where: voiceWhere,
      include: { userAccount: { select: { id: true, userId: true, discordUsername: true, discordGlobalName: true, discordServerNickname: true } } },
      orderBy: [{ occurredAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discordVoiceEvent.count({ where: { ...voiceWhere, eventType: "JOIN" } }),
    prisma.discordVoiceEvent.count({ where: { ...voiceWhere, eventType: "LEAVE" } }),
    prisma.discordVoiceEvent.count({ where: { ...voiceWhere, eventType: "MOVE" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(voiceTotal / pageSize));

  return (
    <main className="admin-page discord-ops-page">
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>DISCORD VOICE LOG</p>
            <h1 className={styles.title}>Discord 상세 로그</h1>
            <p className={styles.desc}>음성방 입장, 이동, 퇴장 이벤트를 검색합니다. 유저명과 채널명이 길어도 표가 깨지지 않도록 열 폭을 고정했습니다.</p>
          </div>
          <div className={styles.actions}><Link className={styles.secondaryButton} href="/admin/discord">대시보드</Link></div>
        </div>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}><span className={styles.statLabel}>검색 결과</span><strong className={styles.statValue}>{voiceTotal.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>최근 {days}일 기준</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>입장</span><strong className={styles.statValue}>{joinCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>JOIN 이벤트</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>퇴장</span><strong className={styles.statValue}>{leaveCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>LEAVE 이벤트</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>이동</span><strong className={styles.statValue}>{moveCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>MOVE 이벤트</div></div>
        </section>

        <form className={styles.filterCard} method="get">
          <div className={styles.filterGrid}>
            <label className={styles.fieldLabel}>검색<input className={styles.input} name="q" defaultValue={q} placeholder="유저명, 채널명, Discord ID" /></label>
            <label className={styles.fieldLabel}>기간<select className={styles.select} name="days" defaultValue={String(days)}><option value="1">최근 1일</option><option value="3">최근 3일</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label>
            <label className={styles.fieldLabel}>페이지 크기<select className={styles.select} name="pageSize" defaultValue={String(pageSize)}>{PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}개</option>)}</select></label>
            <button className={styles.button} type="submit">조회</button>
          </div>
        </form>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><h2 className={styles.cardTitle}>음성 이벤트 로그</h2><p className={styles.cardMeta}>최신순 · 페이지당 {pageSize}개</p></div></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th className={styles.colTime}>시간</th><th className={styles.colEvent}>이벤트</th><th className={styles.colUser}>유저</th><th className={styles.colChannel}>현재 채널</th><th className={styles.colChannel}>이전 채널</th><th className={styles.colId}>Discord ID</th></tr></thead>
              <tbody>{events.length === 0 ? <tr><td className={styles.empty} colSpan={6}>음성 이벤트가 없습니다.</td></tr> : events.map((event) => {
                const time = formatDateParts(event.occurredAt);
                return <tr key={event.id}><td data-label="시간"><span className={styles.dateStack}>{time.dateText}<small>{time.timeText}</small></span></td><td data-label="이벤트"><span className={eventClass(event.eventType)}>{labelEventType(event.eventType)}</span></td><td data-label="유저"><span className={styles.primaryText}>{getUserLabel(event)}</span><div className={styles.muted}>{event.userAccount?.userId || "계정 미연동"}</div></td><td data-label="현재 채널">{event.channelName || <span className={styles.muted}>-</span>}</td><td data-label="이전 채널">{event.previousChannelName || <span className={styles.muted}>-</span>}</td><td data-label="Discord ID" className={styles.mono}>{event.discordId}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className={styles.pagination}><Link aria-disabled={page <= 1} href={buildQuery(params, { page: Math.max(1, page - 1) })}>이전</Link><span>{page} / {pageCount}</span><Link aria-disabled={page >= pageCount} href={buildQuery(params, { page: Math.min(pageCount, page + 1) })}>다음</Link></div>
        </section>
      </div>
    </main>
  );
}
