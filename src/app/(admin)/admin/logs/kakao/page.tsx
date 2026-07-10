import Link from "next/link";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { prisma } from "@/lib/prisma/client";
import { getSiteSettings } from "@/lib/site/settings";
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
  ip?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  KAKAO_PARTY_RECRUIT_CREATE: "카카오 구인 생성",
  KAKAO_PARTY_RECRUIT_JOIN: "카카오 구인 참가",
  KAKAO_PARTY_RECRUIT_FINISH: "카카오 구인 마감",
  KAKAO_PARTY_RECRUIT_RESET: "카카오 구인 초기화",
  KAKAO_PARTY_RECRUIT_SYNC: "카카오 구인 동기화",
  KAKAO_PARTY_RECRUIT_AUTO_FINISH: "카카오 자동 마감",
  KAKAO_SEASON_APPLY: "카카오 내전 신청",
  KAKAO_OPERATION_FORM: "카카오 운영신청",
};

function labelAction(action: string) {
  if (!action) return "기록";
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .replaceAll("KAKAO", "카카오")
    .replaceAll("RECRUIT", "구인")
    .replaceAll("PARTY", "파티")
    .replaceAll("CREATE", "생성")
    .replaceAll("JOIN", "참가")
    .replaceAll("FINISH", "마감")
    .replaceAll("RESET", "초기화")
    .replaceAll("SYNC", "동기화")
    .replaceAll("AUTO", "자동")
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

async function getKakaoLogs(): Promise<LogRow[]> {
  const db = prisma as any;
  const rows: LogRow[] = [];

  if (db.adminLog?.findMany) {
    const adminLogs = await db.adminLog.findMany({
      where: {
        OR: [
          { action: { contains: "KAKAO", mode: "insensitive" } },
          { targetType: { contains: "Kakao", mode: "insensitive" } },
          { targetType: { contains: "RecruitParty", mode: "insensitive" } },
          { message: { contains: "카카오", mode: "insensitive" } },
          { message: { contains: "구인", mode: "insensitive" } },
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
        ip: item.ip ?? item.ipAddress ?? null,
      });
    }
  }

  if (db.recruitPartyLog?.findMany) {
    const recruitLogs = await db.recruitPartyLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 120,
    }).catch(() => []);

    for (const item of recruitLogs) {
      rows.push({
        id: `recruit-${text(item.id)}`,
        createdAt: asDate(item.createdAt),
        source: "카카오 구인",
        action: text(item.action ?? item.type, "구인 기록"),
        actor: text(item.senderName ?? item.actorName ?? item.createdBy),
        target: text(item.roomName ?? item.partyTitle ?? item.recruitId),
        message: text(item.message ?? item.summary ?? item.rawText ?? item.memo),
        ip: null,
      });
    }
  }

  if (db.seasonParticipationPendingApply?.findMany) {
    const applies = await db.seasonParticipationPendingApply.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    }).catch(() => []);

    for (const item of applies) {
      rows.push({
        id: `apply-${text(item.id)}`,
        createdAt: asDate(item.createdAt),
        source: "내전 참가신청",
        action: "KAKAO_SEASON_APPLY",
        actor: text(item.name ?? item.playerName ?? item.nickname),
        target: text(item.seasonTitle ?? item.seasonId ?? item.matchTitle),
        message: [item.currentTier, item.peakTier, item.primaryLane, item.secondaryLane].filter(Boolean).join(" / ") || "참가신청",
        ip: null,
      });
    }
  }

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
}

export default async function AdminKakaoOnlyLogsPage() {
  const siteSettings = await getSiteSettings();
  const logs = await getKakaoLogs();
  const recent24h = logs.filter((log) => Date.now() - log.createdAt.getTime() <= 24 * 60 * 60 * 1000).length;
  const sources = new Set(logs.map((log) => log.source)).size;
  const actions = new Set(logs.map((log) => log.action)).size;

  return (
    <PremiumFeatureGate feature="kakao" settings={siteSettings}>
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>KAKAO LOGS</p>
          <h1>카카오톡 관련 로그</h1>
          <p>카카오톡 구인, 내전 참가신청, 운영신청과 연결된 로그만 분리해서 확인합니다.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/admin/logs" className={styles.secondaryButton}>전체 로그</Link>
          <Link href="/admin/kakao/stats" className={styles.primaryButton}>카카오 통계</Link>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}><span>표시 로그</span><strong>{logs.length.toLocaleString()}건</strong></div>
        <div className={styles.summaryCard}><span>최근 24시간</span><strong>{recent24h.toLocaleString()}건</strong></div>
        <div className={styles.summaryCard}><span>로그 출처</span><strong>{sources.toLocaleString()}종</strong></div>
        <div className={styles.summaryCard}><span>작업 종류</span><strong>{actions.toLocaleString()}종</strong></div>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>카카오톡 로그 목록</h2>
            <p>긴 메시지는 줄바꿈되며, 화면이 좁으면 카드형으로 표시됩니다.</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className={styles.empty}>표시할 카카오톡 관련 로그가 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>출처</th>
                  <th>작업</th>
                  <th>처리자/발신자</th>
                  <th>대상</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="시간"><span className={styles.time}>{fmt(log.createdAt)}</span></td>
                    <td data-label="출처"><span className={styles.sourceBadge}>{log.source}</span></td>
                    <td data-label="작업"><span className={styles.actionBadge} title={log.action}>{labelAction(log.action)}</span></td>
                    <td data-label="처리자/발신자">{log.actor}</td>
                    <td data-label="대상">{log.target}</td>
                    <td data-label="내용"><span className={styles.message}>{log.message}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
    </PremiumFeatureGate>
  );
}
