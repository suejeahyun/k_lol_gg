export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import styles from "../AdminKakaoReadable.module.css";

type PageSearchParams = { page?: string; q?: string; date?: string };
type PageProps = { searchParams: Promise<PageSearchParams> };
const PAGE_SIZE = 20;

function formatDateParts(date: Date) {
  const dateText = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const timeText = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return { dateText, timeText };
}

function normalizePosition(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "-";
}

export default async function AdminKakaoSeasonApplyPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const page = Number(resolved.page ?? "1");
  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const q = String(resolved.q ?? "").trim();
  const date = String(resolved.date ?? "").trim();

  const where: Prisma.SeasonParticipationPendingApplyWhereInput = {};
  if (date) where.applyDate = { gte: new Date(`${date}T00:00:00+09:00`), lt: new Date(`${date}T23:59:59.999+09:00`) };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { currentTier: { contains: q, mode: "insensitive" } },
      { peakTier: { contains: q, mode: "insensitive" } },
      { sourceRoom: { contains: q, mode: "insensitive" } },
      { sourceSender: { contains: q, mode: "insensitive" } },
    ];
  }

  const [totalCount, applies, todayCount, reserveCount] = await Promise.all([
    prisma.seasonParticipationPendingApply.count({ where }),
    prisma.seasonParticipationPendingApply.findMany({
      where,
      include: { season: { select: { name: true, isActive: true } } },
      orderBy: [{ applyDate: "desc" }, { recruitNo: "asc" }, { sourceSlotNo: "asc" }, { createdAt: "desc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.seasonParticipationPendingApply.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.seasonParticipationPendingApply.count({ where: { isReserve: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="admin-page">
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>KAKAO SEASON APPLY</p>
            <h1 className={styles.title}>카카오 내전 참가신청</h1>
            <p className={styles.desc}>카카오톡 명령으로 접수된 시즌 내전 참가신청 원본입니다. 신청자, 티어, 라인, 출처를 구분해서 확인합니다.</p>
          </div>
          <div className={styles.actions}>
            <a className={styles.secondaryButton} href="/admin/kakao">카카오톡 요약</a>
          </div>
        </div>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}><span className={styles.statLabel}>검색 결과</span><strong className={styles.statValue}>{totalCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>현재 필터 기준</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>최근 24시간</span><strong className={styles.statValue}>{todayCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>전체 접수 기준</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>예비 신청</span><strong className={styles.statValue}>{reserveCount.toLocaleString("ko-KR")}</strong><div className={styles.statHint}>전체 데이터 기준</div></div>
          <div className={styles.statCard}><span className={styles.statLabel}>페이지</span><strong className={styles.statValue}>{Math.min(safePage, totalPages)} / {totalPages}</strong><div className={styles.statHint}>페이지당 {PAGE_SIZE}건</div></div>
        </section>

        <form className={styles.filterCard} action="/admin/kakao/season-apply">
          <div className={styles.filterGridCompact}>
            <input name="q" defaultValue={q} placeholder="이름, 티어, 방, 보낸 사람 검색" className={styles.input} />
            <input name="date" defaultValue={date} type="date" className={styles.input} />
            <button className={styles.button} type="submit">조회</button>
            <a className={styles.secondaryButton} href="/admin/kakao/season-apply">초기화</a>
          </div>
        </form>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div><h2 className={styles.cardTitle}>참가신청 목록</h2><p className={styles.cardMeta}>신청일 최신순 · 같은 구인번호는 슬롯 순으로 정렬</p></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th className={styles.colTime}>신청일</th><th className={styles.colSeason}>시즌</th><th className={styles.colSmall}>번호</th><th className={styles.colName}>이름</th><th className={styles.colTier}>현재/최고</th><th className={styles.colLine}>라인</th><th className={styles.colSmall}>구분</th><th className={styles.colSource}>출처</th><th className={styles.colRegistered}>등록</th></tr></thead>
              <tbody>
                {applies.length === 0 ? <tr><td className={styles.empty} colSpan={9}>참가신청이 없습니다.</td></tr> : applies.map((apply) => {
                  const applyDate = formatDateParts(apply.applyDate);
                  const created = formatDateParts(apply.createdAt);
                  return (
                    <tr key={apply.id}>
                      <td data-label="신청일"><span className={styles.dateStack}>{applyDate.dateText}<small>{applyDate.timeText}</small></span></td>
                      <td data-label="시즌"><span className={styles.primaryText}>{apply.season.name}</span>{apply.season.isActive ? <div className={styles.muted}>활성 시즌</div> : null}</td>
                      <td data-label="번호"><span className={styles.badge}>#{apply.recruitNo}</span></td>
                      <td data-label="이름"><span className={styles.primaryText}>{apply.name}</span><div className={styles.muted}>slot {apply.sourceSlotNo ?? "-"}</div></td>
                      <td data-label="현재/최고"><span className={styles.primaryText}>{apply.currentTier}</span><div className={styles.muted}>{apply.peakTier}</div></td>
                      <td data-label="라인"><span className={styles.badgeMuted}>{normalizePosition(apply.mainPosition)}</span><div className={styles.muted}>{apply.subPositions.length ? apply.subPositions.map(normalizePosition).join(" · ") : "부라인 없음"}</div></td>
                      <td data-label="구분">{apply.isReserve ? <span className={styles.actionBadge}>예비</span> : <span className={styles.badge}>일반</span>}</td>
                      <td data-label="출처"><div className={styles.primaryText}>{apply.sourceRoom || apply.source}</div><div className={styles.muted}>{apply.sourceSender || "-"}</div></td>
                      <td data-label="등록"><span className={styles.dateStack}>{created.dateText}<small>{created.timeText}</small></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.paginationWrap}>
            <Pagination currentPage={Math.min(safePage, totalPages)} totalPages={totalPages} basePath="/admin/kakao/season-apply" query={{ q: q || undefined, date: date || undefined }} />
          </div>
        </section>
      </div>
    </main>
  );
}
