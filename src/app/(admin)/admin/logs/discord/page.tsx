import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type LogRow = {
  id: string;
  createdAt: Date;
  source: string;
  action: string;
  actor: string;
  target: string;
  message: string;
  discordId?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  DISCORD_LINKED_BY_USER: "디스코드 계정 연동",
  DISCORD_UNLINKED_BY_USER: "디스코드 계정 해제",
  DISCORD_VOICE_JOIN: "음성방 입장",
  DISCORD_VOICE_LEAVE: "음성방 퇴장",
  DISCORD_VOICE_MOVE: "음성방 이동",
  DISCORD_RECRUIT_VERIFY: "구인 검증",
  DISCORD_MATCH_ATTENDANCE: "내전 출석 확인",
  DISCORD_ROLE_SYNC: "역할 동기화",
  DISCORD_BOT_HEARTBEAT: "봇 상태 수신",
};

function labelAction(action: string) {
  if (!action) return "기록";
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .replaceAll("DISCORD", "디스코드")
    .replaceAll("VOICE", "음성")
    .replaceAll("JOIN", "입장")
    .replaceAll("LEAVE", "퇴장")
    .replaceAll("MOVE", "이동")
    .replaceAll("RECRUIT", "구인")
    .replaceAll("MATCH", "내전")
    .replaceAll("ATTENDANCE", "출석")
    .replaceAll("SYNC", "동기화")
    .replaceAll("_", " ")
    .trim();
}

function fmt(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? Date.now()));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

async function getDiscordLogs(): Promise<LogRow[]> {
  const db = prisma as any;
  const rows: LogRow[] = [];

  if (db.adminLog?.findMany) {
    const adminLogs = await db.adminLog.findMany({
      where: {
        OR: [
          { action: { contains: "DISCORD", mode: "insensitive" } },
          { targetType: { contains: "Discord", mode: "insensitive" } },
          { message: { contains: "디스코드", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }).catch(() => []);

    for (const item of adminLogs) {
      rows.push({
        id: `admin-${text(item.id)}`,
        createdAt: asDate(item.createdAt),
        source: "관리자 로그",
        action: text(item.action, "기록"),
        actor: text(item.actorName ?? item.actorEmail ?? item.adminName ?? item.userName),
        target: text(item.targetName ?? item.targetType ?? item.targetId),
        message: text(item.message ?? item.detail ?? item.description ?? item.summary),
        discordId: item.discordId ?? null,
      });
    }
  }

  if (db.discordOperationLog?.findMany) {
    const operationLogs = await db.discordOperationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 120,
    }).catch(() => []);

    for (const item of operationLogs) {
      rows.push({
        id: `operation-${text(item.id)}`,
        createdAt: asDate(item.createdAt),
        source: "운영 로그",
        action: text(item.action ?? item.type, "디스코드 운영"),
        actor: text(item.actorName ?? item.userName ?? item.discordName),
        target: text(item.channelName ?? item.targetName ?? item.targetId),
        message: text(item.message ?? item.summary ?? item.detail),
        discordId: item.discordUserId ?? item.discordId ?? null,
      });
    }
  }

  if (db.discordVoiceEvent?.findMany) {
    const voiceEvents = await db.discordVoiceEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 160,
    }).catch(() => []);

    for (const item of voiceEvents) {
      const eventType = text(item.eventType ?? item.type, "DISCORD_VOICE");
      rows.push({
        id: `voice-${text(item.id)}`,
        createdAt: asDate(item.createdAt ?? item.joinedAt ?? item.leftAt),
        source: "음성 이벤트",
        action: eventType,
        actor: text(item.displayName ?? item.nickname ?? item.username ?? item.discordName),
        target: text(item.channelName ?? item.channelId),
        message: text(item.message ?? item.summary ?? `${text(item.channelName ?? item.channelId)} ${eventType}`),
        discordId: item.discordUserId ?? item.userId ?? null,
      });
    }
  }

  if (db.discordAccountLinkLog?.findMany) {
    const linkLogs = await db.discordAccountLinkLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    }).catch(() => []);

    for (const item of linkLogs) {
      rows.push({
        id: `link-${text(item.id)}`,
        createdAt: asDate(item.createdAt),
        source: "계정 연동",
        action: text(item.action ?? item.type, "DISCORD_LINK"),
        actor: text(item.discordUsername ?? item.discordName ?? item.userName),
        target: text(item.playerName ?? item.userId ?? item.playerId),
        message: text(item.message ?? item.summary ?? "디스코드 계정 연동 기록"),
        discordId: item.discordUserId ?? item.discordId ?? null,
      });
    }
  }

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 240);
}

export default async function AdminDiscordOnlyLogsPage() {
  const logs = await getDiscordLogs();
  const recent24h = logs.filter((log) => Date.now() - log.createdAt.getTime() <= 24 * 60 * 60 * 1000).length;
  const voiceCount = logs.filter((log) => log.source.includes("음성")).length;
  const linkCount = logs.filter((log) => log.source.includes("연동")).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DISCORD LOGS</p>
          <h1>디스코드 관련 로그</h1>
          <p>음성 이벤트, 계정 연동, 구인 검증, 내전 출석 관련 로그만 분리해서 확인합니다.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/admin/logs" className={styles.secondaryButton}>전체 로그</Link>
          <Link href="/admin/logs/stats" className={styles.primaryButton}>디스코드 통계</Link>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}><span>표시 로그</span><strong>{logs.length.toLocaleString()}건</strong></div>
        <div className={styles.summaryCard}><span>최근 24시간</span><strong>{recent24h.toLocaleString()}건</strong></div>
        <div className={styles.summaryCard}><span>음성 이벤트</span><strong>{voiceCount.toLocaleString()}건</strong></div>
        <div className={styles.summaryCard}><span>계정 연동</span><strong>{linkCount.toLocaleString()}건</strong></div>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>디스코드 로그 목록</h2>
            <p>Discord ID와 채널명은 줄바꿈 처리되어 화면 밖으로 밀리지 않습니다.</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className={styles.empty}>표시할 디스코드 관련 로그가 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>출처</th>
                  <th>작업</th>
                  <th>유저</th>
                  <th>대상/채널</th>
                  <th>내용</th>
                  <th>Discord ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="시간"><span className={styles.time}>{fmt(log.createdAt)}</span></td>
                    <td data-label="출처"><span className={styles.sourceBadge}>{log.source}</span></td>
                    <td data-label="작업"><span className={styles.actionBadge} title={log.action}>{labelAction(log.action)}</span></td>
                    <td data-label="유저">{log.actor}</td>
                    <td data-label="대상/채널">{log.target}</td>
                    <td data-label="내용"><span className={styles.message}>{log.message}</span></td>
                    <td data-label="Discord ID"><code className={styles.code}>{log.discordId || "-"}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}