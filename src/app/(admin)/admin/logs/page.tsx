export const dynamic = "force-dynamic";

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams?: Promise<SearchParams> };

function getString(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function getNumber(params: SearchParams, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(getString(params, key, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function buildHref(params: SearchParams, patch: Record<string, string | number | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return `/admin/logs${query ? `?${query}` : ""}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function compact(value: string | null | undefined, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function koLabel(value: string | null | undefined) {
  const raw = compact(value, "미지정");
  const key = raw.toUpperCase();
  const exact: Record<string, string> = {
    ADMIN_LOGIN: "관리자 로그인",
    USER_LOGIN: "유저 로그인",
    USER_LOGOUT: "유저 로그아웃",
    KAKAO_PARTY_RECRUIT_SYNC: "카카오 구인 동기화",
    KAKAO_PARTY_RECRUIT_CREATE: "카카오 구인 생성",
    KAKAO_PARTY_RECRUIT_FINISH: "카카오 구인 마감",
    KAKAO_RECRUIT_SEASON_APPLY: "카카오 내전 참가신청",
    AUTO_IDLE_FINISH: "활동 없음 자동마감",
    AUTO_IDLE_RESET: "활동 없음 자동초기화",
    BACKUP_CSV_DOWNLOAD: "CSV 백업 다운로드",
    PLAYER_UPDATE: "플레이어 수정",
    PLAYER_DEACTIVATE: "플레이어 비활성화",
    DESTRUCTION_AUCTION_DRAW: "멸망전 경매 추첨",
    DESTRUCTION_AUCTION_HOLD: "멸망전 경매 보류",
    DESTRUCTION_PARTICIPATION_APPLY: "멸망전 참가 신청",
    BALANCE_RECOMMENDATION: "밸런스 추천",
    USERACCOUNT: "계정",
    RECRUITPARTY: "구인",
    RECRUITPARTYLOG: "구인 로그",
    SEASON: "시즌",
    BACKUPCSV: "백업 CSV",
    DESTRUCTIONTOURNAMENT: "멸망전",
  };
  if (exact[key]) return exact[key];
  if (key.includes("LOGIN")) return "로그인";
  if (key.includes("LOGOUT")) return "로그아웃";
  if (key.includes("KAKAO")) return "카카오톡 작업";
  if (key.includes("CREATE")) return "생성";
  if (key.includes("UPDATE") || key.includes("EDIT")) return "수정";
  if (key.includes("DELETE") || key.includes("REMOVE")) return "삭제";
  if (key.includes("FINISH")) return "마감";
  if (key.includes("SYNC")) return "동기화";
  if (key.includes("RESET")) return "초기화";
  return raw;
}

function targetText(log: { targetType: string | null; targetId: string | number | null }) {
  const type = koLabel(log.targetType);
  const id = compact(log.targetId == null ? null : String(log.targetId), "");
  return id ? `${type} #${id}` : type;
}

export default async function AdminLogsPage(props: PageProps) {
  const params = (await props.searchParams) ?? {};
  const q = getString(params, "q").trim();
  const action = getString(params, "action").trim();
  const targetType = getString(params, "targetType").trim();
  const days = getNumber(params, "days", 30, 1, 3650);
  const page = getNumber(params, "page", 1, 1, 99999);
  const pageSize = getNumber(params, "pageSize", 50, 20, 200);
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);

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
  const where: Prisma.AdminLogWhereInput = { AND: and };

  const [logs, total, recentForStats] = await Promise.all([
    prisma.adminLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminLog.count({ where }),
    prisma.adminLog.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { action: true, targetType: true, actorType: true, actorUserId: true, createdAt: true },
    }),
  ]);

  const last24From = new Date(now);
  last24From.setHours(last24From.getHours() - 24);
  const last24FromMs = last24From.getTime();
  const last24Count = recentForStats.filter((log) => new Date(log.createdAt).getTime() >= last24FromMs).length;
  const uniqueActionCount = new Set(recentForStats.map((log) => log.action)).size;
  const uniqueActorCount = new Set(recentForStats.map((log) => log.actorUserId || log.actorType).filter(Boolean)).size;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>시스템 감사</p>
          <h1 className={styles.title}>관리자 감사 로그</h1>
          <p className={styles.desc}>운영 작업, 로그인, 카카오톡 연동 기록을 확인합니다. 자주 쓰는 통계는 별도 대시보드에서 확인할 수 있습니다.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/admin/logs/stats">로그 통계 보기</Link>
        </div>
      </div>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>검색 결과</span><strong>{total.toLocaleString()}건</strong><em>최근 {days}일 기준</em></div>
        <div className={styles.kpiCard}><span>최근 24시간</span><strong>{last24Count.toLocaleString()}건</strong><em>실시간 작업량</em></div>
        <div className={styles.kpiCard}><span>작업 종류</span><strong>{uniqueActionCount.toLocaleString()}개</strong><em>작업 코드 기준</em></div>
        <div className={styles.kpiCard}><span>작업 관리자</span><strong>{uniqueActorCount.toLocaleString()}명</strong><em>최근 기간 기준</em></div>
      </section>

      <form className={styles.filterCard} method="get">
        <div className={styles.filterGrid}>
          <label>검색<input name="q" defaultValue={q} placeholder="작업, 내용, 관리자, 대상, IP" /></label>
          <label>작업 코드<input name="action" defaultValue={action} placeholder="예: ADMIN_LOGIN" /></label>
          <label>대상<input name="targetType" defaultValue={targetType} placeholder="예: RecruitParty" /></label>
          <label>기간<select name="days" defaultValue={String(days)}><option value="1">최근 1일</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="365">최근 1년</option></select></label>
          <label>페이지<select name="pageSize" defaultValue={String(pageSize)}><option value="20">20개</option><option value="50">50개</option><option value="100">100개</option></select></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </div>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div><h2>최근 로그</h2><p>작업 코드는 한국어 배지로 표시하고, 원본 코드는 검색에 사용할 수 있습니다.</p></div>
          <span className={styles.tableMeta}>{page.toLocaleString()} / {pageCount.toLocaleString()} 페이지</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup><col style={{ width: "120px" }} /><col style={{ width: "180px" }} /><col style={{ width: "170px" }} /><col style={{ width: "150px" }} /><col /><col style={{ width: "130px" }} /></colgroup>
            <thead><tr><th>시간</th><th>작업</th><th>관리자</th><th>대상</th><th>내용</th><th>IP</th></tr></thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6}><div className={styles.empty}>표시할 로그가 없습니다.</div></td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td className={styles.timeCell} data-label="시간">{formatDate(log.createdAt)}</td>
                  <td data-label="작업"><span className={styles.badge} title={compact(log.action)}>{koLabel(log.action)}</span></td>
                  <td data-label="관리자"><div className={styles.actor}><strong>{compact(log.actorUserId || log.actorType, "시스템")}</strong><span>{compact(log.actorType, "-")}</span></div></td>
                  <td className={styles.target} data-label="대상">{targetText({ targetType: log.targetType, targetId: log.targetId == null ? null : String(log.targetId) })}</td>
                  <td className={styles.message} data-label="내용">{compact(log.message)}</td>
                  <td className={styles.ip} data-label="IP">{compact(log.ipAddress)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.max(1, page - 1) })}>이전</Link>
          <span className={styles.pageInfo}>{page.toLocaleString()} / {pageCount.toLocaleString()}</span>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.min(pageCount, page + 1) })}>다음</Link>
        </div>
      </section>
    </main>
  );
}
