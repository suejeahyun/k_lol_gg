import Link from "next/link";
import { Plus } from "@/components/theme/theme-icons";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { competitionEventFormatLabel, publicEventStatusLabel } from "@/modules/competitions/core";
import { EVENT_FORMATS, EVENT_PUBLIC_STATUSES, parseEventListQuery } from "@/modules/competitions/events";
import { loadRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

import styles from "./event-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminEventProgressPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN", "/admin/progress/event");
  const raw = await searchParams;
  const url = new URL("https://v2.invalid/admin/progress/event");
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
    else if (typeof value === "string") url.searchParams.set(key, value);
  }
  const query = parseEventListQuery(url.href);
  const result = query ? await loadRuntimeEvent(({ repository }) => repository.listAdmin(query, new Date())) : { state: "invalid" as const };
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(query?.pageSize ?? 12) });
    if (query?.query) params.set("q", query.query);
    if (query?.status) params.set("status", query.status);
    if (query?.format) params.set("format", query.format);
    return `/admin/progress/event?${params}`;
  };
  const resetHref = `/admin/progress/event?pageSize=${query?.pageSize ?? 12}`;
  const filtered = Boolean(query?.query || query?.status || query?.format);
  const pageCount = result.state === "ready" ? Math.min(10_000, result.data.totalPages) : 0;
  return <main className={styles.page}>
    <nav className={styles.competitionKinds} aria-label="분리된 대회 관리"><Link aria-current="page" href="/admin/progress/event">이벤트 대회 관리</Link><Link href="/admin/progress/destruction">멸망전 관리</Link></nav>
    <header className={styles.hero}><div><h1>이벤트전 작업 공간</h1></div><Link href="/admin/progress/event/new"><Plus aria-hidden="true" /> 새 이벤트전</Link></header>
    <form key={JSON.stringify(query)} className={styles.filters} action="/admin/progress/event" method="get"><input type="hidden" name="pageSize" value={query?.pageSize ?? 12} /><label>이름 검색<input name="q" defaultValue={query?.query ?? ""} maxLength={64} /></label><label>상태<select name="status" defaultValue={query?.status ?? ""}><option value="">전체</option>{EVENT_PUBLIC_STATUSES.map((status) => <option key={status} value={status}>{publicEventStatusLabel(status)}</option>)}</select></label><label>방식<select name="format" defaultValue={query?.format ?? ""}><option value="">전체</option>{EVENT_FORMATS.map((format) => <option key={format} value={format}>{competitionEventFormatLabel(format)}</option>)}</select></label><button type="submit">조회</button></form>
    {filtered && result.state === "ready" && result.data.items.length > 0 ? <p><Link href={resetHref}>검색 초기화</Link></p> : null}
    {result.state === "ready" ? result.data.items.length ? <>
      <section className={styles.list}>{result.data.items.map((event) => <Link href={`/admin/progress/event/${event.id}`} key={event.id}><div><strong>{event.title}</strong><span>{competitionEventFormatLabel(event.format)} · {publicEventStatusLabel(event.status)}</span></div><b>{event.participantCount}/10</b><small>변경 버전 {event.revision}</small></Link>)}</section>
      {pageCount > 1 ? <nav className="pagination" aria-label="이벤트전 관리 목록 페이지">
        {result.data.page > 1 ? <Link href={pageHref(result.data.page - 1)} rel="prev">이전</Link> : <span aria-disabled="true">이전</span>}
        <strong aria-current="page">{result.data.page} / {pageCount}</strong>
        {result.data.page < pageCount ? <Link href={pageHref(result.data.page + 1)} rel="next">다음</Link> : <span aria-disabled="true">다음</span>}
      </nav> : null}
    </> : <section className={styles.state} role="status"><h2>{result.data.total > 0 ? "현재 페이지에 대회가 없습니다." : filtered ? "조건에 맞는 이벤트전이 없습니다." : "등록된 이벤트전이 없습니다."}</h2>{result.data.total > 0 || (query?.page ?? 1) > 1 ? <Link href={pageHref(1)}>첫 페이지로</Link> : filtered ? <Link href={resetHref}>검색 초기화</Link> : <Link href="/admin/progress/event/new">새 이벤트전</Link>}</section> : <section className={styles.state} role={result.state === "error" || result.state === "invalid" ? "alert" : "status"}><h2>{result.state === "invalid" ? "목록 조건을 확인해 주세요." : "이벤트전 저장소를 불러올 수 없습니다."}</h2>{query ? <a href={pageHref(query.page)}>다시 불러오기</a> : <Link href="/admin/progress/event">목록 초기화</Link>}</section>}
  </main>;
}
