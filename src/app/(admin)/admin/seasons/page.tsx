import { CalendarCheck2, Database, Filter, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseAdminSeasonQuery } from "@/modules/seasons/infrastructure/admin-season-query";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";

import { CreateSeasonForm, ReviewApplicationForm, SeasonRowActions } from "./season-admin-actions";
import styles from "./seasons.module.css";

export const dynamic = "force-dynamic";

const seasonStatusLabel = { DRAFT: "초안", ACTIVE: "진행 중", ENDED: "종료", RETIRED: "보관됨" } as const;
const applicationStatusLabel = { APPLIED: "신청", CONFIRMED: "참가 확정", RESERVE: "예비", REJECTED: "반려", CANCELLED: "취소" } as const;
const applicationSourceLabel = { SITE: "사이트", KAKAO: "카카오" } as const;
const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터", ALL: "모든 포지션" } as const;

function pageHref(search: URLSearchParams, page: number) {
  const next = new URLSearchParams(search);
  next.set("page", String(page));
  return `/admin/seasons?${next.toString()}`;
}

function kstDisplay(value: string | null) {
  return value
    ? new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    : "제한 없음";
}

export default async function AdminSeasonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole("ADMIN", "/admin/seasons");
  const raw = await searchParams;
  const rawView = raw.view;
  const applicationView = rawView === "applications";
  const invalidView = rawView !== undefined && !applicationView;
  const url = new URL("http://local.test/admin/seasons");
  for (const [key, value] of Object.entries(raw)) {
    if (key === "view") continue;
    if (typeof value === "string") url.searchParams.set(key, value);
    else if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
  }
  let queryError = invalidView;
  let query;
  try {
    if (invalidView) throw new Error("INVALID_VIEW");
    query = parseAdminSeasonQuery(url.toString());
  } catch {
    queryError = true;
    query = { page: 1, pageSize: 20 } as const;
  }
  const paginationSearch = new URLSearchParams();
  if (applicationView) paginationSearch.set("view", "applications");
  if (query.seasonId) paginationSearch.set("seasonId", query.seasonId);
  if (query.status) paginationSearch.set("status", query.status);
  if (query.source) paginationSearch.set("source", query.source);
  if (query.query) paginationSearch.set("q", query.query);
  if (query.pageSize !== 20) paginationSearch.set("limit", String(query.pageSize));
  const result = await loadRuntimeSeasonData((service) => service.getAdminWorkspace(query));

  return (
    <main className={styles.page} data-admin-season-view={queryError ? "invalid" : applicationView ? "applications" : "seasons"}>
      <header className={styles.header}>
        <div>
          <span><ShieldCheck aria-hidden="true" /> 보호된 작업 공간 · A3</span>
          <h1>시즌·참가</h1>
          <p>시즌 운영 단계와 사이트·카카오 참가 신청을 같은 작업 흐름에서 검토합니다.</p>
        </div>
        <b>관리자 / 최고 관리자</b>
      </header>
      <nav className={styles.viewTabs} aria-label="시즌 관리자 보기"><a href="/admin/seasons" aria-current={!applicationView ? "page" : undefined}>시즌 수명주기</a><a href="/admin/seasons?view=applications" aria-current={applicationView ? "page" : undefined}>참가 신청 검토</a><Link href="/admin/seasons/kakao-pending">Kakao 보류 신청</Link></nav>

      {result.state !== "ready" ? (
        <section className={styles.state} role={result.state === "error" ? "alert" : "status"}>
          <Database aria-hidden="true" />
          <h2>{result.state === "unavailable" ? "시즌 정보를 확인할 수 없습니다." : "시즌 작업 공간을 불러오지 못했습니다."}</h2>
          <p>운영 데이터베이스나 샘플 데이터로 대체하지 않고 안전한 연결을 기다립니다.</p>
        </section>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="create-season-title">
            <div className={styles.panelHeading}><div><span>새 시즌</span><h2 id="create-season-title">초안 시즌 만들기</h2></div><CalendarCheck2 aria-hidden="true" /></div>
            <CreateSeasonForm />
          </section>

          <section className={styles.panel} aria-labelledby="season-list-title">
            <div className={styles.panelHeading}><div><span>운영 단계</span><h2 id="season-list-title">시즌 목록</h2></div><strong>{result.data.seasons.length}개</strong></div>
            {result.data.seasons.length === 0 ? <div className={styles.empty}>등록된 시즌이 없습니다.</div> : (
              <div className={styles.seasonList}>
                {result.data.seasons.map((season) => (
                  <article key={season.id}>
                    <div className={styles.seasonIdentity}>
                      <b data-status={season.status}>{seasonStatusLabel[season.status]}</b>
                      <div><h3>{season.name}</h3><p>변경 버전 {season.revision} · 신청 {season.applicationCount}건</p></div>
                    </div>
                    <dl>
                      <div><dt>신청 시작</dt><dd>{kstDisplay(season.applicationsOpenAt)}</dd></div>
                      <div><dt>신청 종료</dt><dd>{kstDisplay(season.applicationsCloseAt)}</dd></div>
                    </dl>
                    <SeasonRowActions season={season} />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="application-review-title" data-focus={applicationView || undefined}>
            <div className={styles.panelHeading}><div><span>검토 대기</span><h2 id="application-review-title">참가 신청 검토</h2></div><strong>{result.data.applicationTotalCount}건</strong></div>
            <form className={styles.filters} action="/admin/seasons" method="get">
              {applicationView ? <input type="hidden" name="view" value="applications" /> : null}
              <Filter aria-hidden="true" />
              <label><span className="sr-only">회원명·닉네임·Riot ID 검색</span><input name="q" defaultValue={query.query} maxLength={80} placeholder="회원명·닉네임·Riot ID" /></label>
              <label><span className="sr-only">시즌 필터</span><select name="seasonId" defaultValue={query.seasonId ?? ""}><option value="">모든 시즌</option>{result.data.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
              <label><span className="sr-only">신청 상태 필터</span><select name="status" defaultValue={query.status ?? ""}><option value="">모든 상태</option>{(["APPLIED", "CONFIRMED", "RESERVE", "REJECTED", "CANCELLED"] as const).map((status) => <option key={status} value={status}>{applicationStatusLabel[status]}</option>)}</select></label>
              <label><span className="sr-only">신청 출처 필터</span><select name="source" defaultValue={query.source ?? ""}><option value="">모든 출처</option><option value="SITE">사이트</option><option value="KAKAO">카카오</option></select></label>
              <button type="submit">조회</button>
              <a href={applicationView ? "/admin/seasons?view=applications" : "/admin/seasons"}>초기화</a>
            </form>
            {queryError ? <p className={styles.filterError} role="alert">허용되지 않거나 올바르지 않은 조회 조건을 초기화했습니다.</p> : null}

            {result.data.applications.length === 0 ? <div className={styles.empty}>조건에 맞는 참가 신청이 없습니다.</div> : (
              <div className={styles.applicationTable} role="region" aria-label="참가 신청 검토 표" tabIndex={0}>
                <table>
                  <thead><tr><th>신청자</th><th>시즌·회차</th><th>라인</th><th>상태·출처</th><th>검토</th></tr></thead>
                  <tbody>{result.data.applications.map((application) => (
                    <tr key={application.id}>
                      <td data-label="신청자"><strong>{application.player.displayName}</strong><small>{application.player.riotId}</small><em>{application.player.memberName}</em></td>
                      <td data-label="시즌·회차"><strong>{application.seasonName}</strong><small>{application.applyDate} · #{application.recruitNo}</small></td>
                      <td data-label="라인"><strong>{positionLabel[application.mainPosition]}</strong><small>{application.subPositions.map((position) => positionLabel[position]).join(" · ") || "부라인 없음"}</small></td>
                      <td data-label="상태·출처"><b data-status={application.status}>{applicationStatusLabel[application.status]}</b><small>{applicationSourceLabel[application.source]} · 변경 버전 {application.revision}</small></td>
                      <td data-label="검토"><ReviewApplicationForm application={application} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {result.data.applicationTotalPages > 1 ? (
              <nav className={styles.pagination} aria-label="참가 신청 페이지">
                {result.data.applicationPage > 1 ? <a href={pageHref(paginationSearch, result.data.applicationPage - 1)}>이전</a> : <span aria-disabled="true">이전</span>}
                <strong>{result.data.applicationPage} / {result.data.applicationTotalPages}</strong>
                {result.data.applicationPage < result.data.applicationTotalPages ? <a href={pageHref(paginationSearch, result.data.applicationPage + 1)}>다음</a> : <span aria-disabled="true">다음</span>}
              </nav>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
