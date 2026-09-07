import Link from "next/link";
import { Plus, Trophy } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseEventListQuery } from "@/modules/competitions/events";
import { loadRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

import styles from "./event-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminEventProgressPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN", "/admin/progress/event");
  const raw = await searchParams;
  const url = new URL("https://v2.invalid/admin/progress/event");
  for (const key of ["q", "status", "format", "page", "pageSize"] as const) if (typeof raw[key] === "string") url.searchParams.set(key, raw[key]);
  const query = parseEventListQuery(url.href) ?? { query: "", status: null, format: null, page: 1, pageSize: 12 as const };
  const result = await loadRuntimeEvent(({ repository }) => repository.listAdmin(query, new Date()));
  return <main className={styles.page}>
    <header className={styles.hero}><div><span><Trophy aria-hidden="true" /> S07 EVENT OPERATIONS</span><h1>이벤트전 작업 공간</h1><p>모집부터 완료까지 현재 단계와 다음 작업을 이어서 처리합니다.</p></div><Link href="/admin/progress/event/new"><Plus aria-hidden="true" /> 새 이벤트전</Link></header>
    <form className={styles.filters} action="/admin/progress/event"><label>이름 검색<input name="q" defaultValue={query.query} maxLength={64} /></label><label>상태<select name="status" defaultValue={query.status ?? ""}><option value="">전체</option>{["PLANNED","RECRUITING","TEAM_BUILDING","IN_PROGRESS","COMPLETED","CANCELLED"].map((status) => <option key={status}>{status}</option>)}</select></label><label>방식<select name="format" defaultValue={query.format ?? ""}><option value="">전체</option><option>POSITION</option><option>ARAM</option></select></label><button type="submit">조회</button></form>
    {result.state === "ready" ? result.data.items.length ? <section className={styles.list}>{result.data.items.map((event) => <Link href={`/admin/progress/event/${event.id}`} key={event.id}><div><strong>{event.title}</strong><span>{event.format} · {event.status}</span></div><b>{event.participantCount}/10</b><small>revision {event.revision}</small></Link>)}</section> : <section className={styles.state} role="status"><h2>등록된 이벤트전이 없습니다.</h2><p>새 이벤트전을 만들어 모집을 시작해 주세요.</p></section> : <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h2>이벤트전 저장소를 불러올 수 없습니다.</h2><p>DB와 migration 상태를 확인해 주세요.</p></section>}
  </main>;
}
