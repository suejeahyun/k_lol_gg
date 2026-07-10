export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import styles from "../../AdminKakaoReadable.module.css";

type PageSearchParams = { page?: string; q?: string; date?: string; action?: string };
type PageProps = { searchParams: Promise<PageSearchParams> };
const PAGE_SIZE = 20;

function formatDateParts(date: Date) {
  const dateText = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const timeText = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return { dateText, timeText };
}

function buildWhere(searchParams: PageSearchParams): Prisma.RecruitPartyLogWhereInput {
  const q = String(searchParams.q ?? "").trim();
  const date = String(searchParams.date ?? "").trim();
  const action = String(searchParams.action ?? "").trim();
  const and: Prisma.RecruitPartyLogWhereInput[] = [];
  if (date) and.push({ recruitDate: date });
  if (action) and.push({ action: { contains: action, mode: "insensitive" } });
  if (q) {
    and.push({ OR: [
      { title: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { roomName: { contains: q, mode: "insensitive" } },
      { sender: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ] });
  }
  return and.length ? { AND: and } : {};
}

export default async function AdminKakaoRecruitLogsPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const page = Number(resolved.page ?? "1");
  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const q = resolved.q ?? "";
  const date = resolved.date ?? "";
  const action = resolved.action ?? "";
  const where = buildWhere(resolved);
  const recentCutoff = new Date();
  recentCutoff.setHours(recentCutoff.getHours() - 24);

  const [totalCount, logs, recentCount, autoCount, finishedCount] = await Promise.all([
    prisma.recruitPartyLog.count({ where }),
    prisma.recruitPartyLog.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.recruitPartyLog.count({ where: { createdAt: { gte: recentCutoff } } }),
    prisma.recruitPartyLog.count({ where: { action: { contains: "AUTO", mode: "insensitive" } } }),
    prisma.recruitPartyLog.count({ where: { action: { contains: "FINISH", mode: "insensitive" } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="admin-page">
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>KAKAO RECRUIT LOG</p>
            <h1 className={styles.title}>카카오 카카오톡 로그</h1>
            <p className={styles.desc}>생성, 참가, 마감, 초기화, 자동마감 기록을 한 화면에서 추적합니다. 긴 요약은 셀 안에서 스크롤됩니다.</p>
          </div>
          <div className={styles.actions}>
            <a className={styles.secondaryButton} href="/admin/kakao/recruits">구인 관리</a>
          </div>
        </div>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}><span className={styles.statLabel}>검색 결과</span><strong className={styles.statValue}>{totalCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>현재 필터 기준</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>최근 24시간</span><strong className={styles.statValue}>{recentCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>전체 로그 기준</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>자동 처리</span><strong className={styles.statValue}>{autoCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>AUTO 계열 액션</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>마감 기록</span><strong className={styles.statValue}>{finishedCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>FINISH 계열 액션</div></div>
        </section>

        <form className={styles.filterCard} action="/admin/logs/kakao">
          <div className={styles.filterGrid}>
            <input name="q" defaultValue={q} placeholder="제목, 액션, 방, 처리자, 요약 검색" className={styles.input} />
            <input name="date" defaultValue={date} type="date" className={styles.input} />
            <input name="action" defaultValue={action} placeholder="액션 필터" className={styles.input} />
            <button className={styles.button} type="submit">조회</button>
            <a className={styles.secondaryButton} href="/admin/logs/kakao">초기화</a>
          </div>
        </form>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div><h2 className={styles.cardTitle}>로그 목록</h2><p className={styles.cardMeta}>페이지당 {PAGE_SIZE}개 · 최신순</p></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th className={styles.colTime}>시간</th><th className={styles.colSmall}>회차</th><th className={styles.colSmall}>번호</th><th className={styles.colAction}>액션</th><th className={styles.colTitle}>제목</th><th className={styles.colPeople}>인원</th><th className={styles.colSource}>방/처리자</th><th className={styles.colSummary}>요약</th></tr>
              </thead>
              <tbody>
                {logs.length === 0 ? <tr><td className={styles.empty} colSpan={8}>카카오톡 로그가 없습니다.</td></tr> : logs.map((log) => {
                  const dateParts = formatDateParts(log.createdAt);
                  return (
                    <tr key={log.id}>
                      <td data-label="시간"><span className={styles.dateStack}>{dateParts.dateText}<small>{dateParts.timeText}</small></span></td>
                      <td data-label="회차"><span className={styles.badgeMuted}>{log.recruitDate || "-"} / {log.resetSeq}</span></td>
                      <td data-label="번호">{log.recruitNo > 0 ? <span className={styles.badge}>#{log.recruitNo}</span> : <span className={styles.muted}>-</span>}</td>
                      <td data-label="액션"><span className={styles.actionBadge}>{log.action}</span></td>
                      <td data-label="제목"><span className={styles.primaryText}>{log.title || "-"}</span></td>
                      <td data-label="인원"><span className={styles.primaryText}>{log.memberCount}/{log.maxMembers}</span></td>
                      <td data-label="방/처리자"><div className={styles.primaryText}>{log.roomName || "-"}</div><div className={styles.muted}>{log.sender || "-"}</div></td>
                      <td data-label="요약"><div className={styles.summaryBox}>{log.summary || "-"}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.paginationWrap}>
            <Pagination currentPage={Math.min(safePage, totalPages)} totalPages={totalPages} basePath="/admin/logs/kakao" query={{ q: q || undefined, date: date || undefined, action: action || undefined }} />
          </div>
        </section>
      </div>
    </main>
  );
}
