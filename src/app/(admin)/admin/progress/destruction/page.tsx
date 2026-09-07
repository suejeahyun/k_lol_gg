import Link from "next/link";
import { Gavel, Plus } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { DESTRUCTION_PRELIMINARY_FORMATS, DESTRUCTION_PUBLIC_STATUSES, parseDestructionListQuery } from "@/modules/competitions/destruction";
import { loadRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

import styles from "../event/event-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminDestructionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN", "/admin/progress/destruction");
  const raw = await searchParams;
  const url = new URL("https://v2.invalid/admin/progress/destruction");
  for (const key of ["q", "status", "format", "page", "pageSize"] as const) if (typeof raw[key] === "string") url.searchParams.set(key, raw[key]);
  const query = parseDestructionListQuery(url.href) ?? { query: "", status: null, format: null, page: 1, pageSize: 12 as const };
  const result = await loadRuntimeDestruction(({ repository }) => repository.listAdmin(query));

  return <main className={styles.page}>
    <header className={styles.hero}><div><span><Gavel aria-hidden="true" /> S08 DESTRUCTION OPERATIONS</span><h1>멸망전 작업 공간</h1><p>모집부터 경매, 예선·본선, 경기별 MVP와 완료까지 이어서 운영합니다.</p></div><Link href="/admin/progress/destruction/new"><Plus aria-hidden="true" /> 새 멸망전</Link></header>
    <form className={styles.filters} action="/admin/progress/destruction"><label>이름 검색<input name="q" defaultValue={query.query} maxLength={64} /></label><label>상태<select name="status" defaultValue={query.status ?? ""}><option value="">전체</option>{DESTRUCTION_PUBLIC_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label>예선 방식<select name="format" defaultValue={query.format ?? ""}><option value="">전체</option>{DESTRUCTION_PRELIMINARY_FORMATS.map((format) => <option key={format}>{format}</option>)}</select></label><button>조회</button></form>
    {result.state === "ready" ? result.data.items.length ? <section className={styles.list}>{result.data.items.map((item) => <Link href={`/admin/progress/destruction/${item.id}`} key={item.id}><div><strong>{item.title}</strong><span>{item.preliminaryFormat} · {item.status}</span></div><b>{item.participantCount}/{item.teams.length ? item.teams.length * 5 : "-"}</b><small>revision {item.revision}</small></Link>)}</section> : <section className={styles.state} role="status"><h2>등록된 멸망전이 없습니다.</h2><p>새 멸망전을 만들어 모집을 시작해 주세요.</p></section> : <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h2>멸망전 저장소를 불러올 수 없습니다.</h2><p>영속 저장소 연결 상태를 확인해 주세요.</p></section>}
  </main>;
}
