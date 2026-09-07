import Link from "next/link";
import { LibraryBig, Plus, Sparkles } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseChampionListQuery } from "@/modules/champions";
import { loadRuntimeChampions } from "@/modules/champions/infrastructure/runtime-champions";

import styles from "./champions.module.css";

export const dynamic = "force-dynamic";

export default async function AdminChampionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN", "/admin/champions");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (typeof value === "string") params.set(key, value);
  }
  const query = parseChampionListQuery(`http://local/admin/champions?${params}`, true);
  const result = query ? await loadRuntimeChampions(true, (service) => service.listAdmin(query)) : { state: "error" as const };
  const pageCount = result.state === "ready" ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;
  return <main className={styles.page}>
    <header className={styles.header}><div><strong>콘텐츠·자료</strong><h1>챔피언 관리</h1><p>경기 원장에 사용되는 챔피언 키와 한글 표시명을 관리합니다.</p></div><Link href="/admin/champions/new"><Plus aria-hidden="true" /> 새 챔피언</Link></header>
    <nav className={styles.tabs} aria-label="콘텐츠 관리"><Link data-active="true" href="/admin/champions">챔피언</Link><Link href="/admin/highlights">하이라이트</Link><Link href="/admin/images">갤러리</Link></nav>
    <form className={styles.filters} action="/admin/champions"><label>검색<input name="q" defaultValue={query?.query ?? ""} maxLength={80} /></label><label>상태<select name="status" defaultValue={query?.status ?? ""}><option value="">전체</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label><input type="hidden" name="pageSize" value={query?.pageSize ?? 30} /><button>적용</button></form>
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles aria-hidden="true" /><h2>챔피언 목록을 불러오지 못했습니다.</h2><p>검색 조건과 데이터베이스 연결을 확인해 주세요.</p></section> : result.data.items.length === 0 ? <section className={styles.state}><LibraryBig aria-hidden="true" /><h2>조건에 맞는 챔피언이 없습니다.</h2><p>새 챔피언을 등록하거나 검색 조건을 바꿔 보세요.</p></section> : <>
      <section className={styles.list} aria-label="챔피언 목록">{result.data.items.map((item) => <Link href={`/admin/champions/${item.key}/edit`} key={item.key}><div><strong>{item.displayName}</strong><code>{item.key}</code></div><span data-status={item.status}>{item.status}</span><small>rev. {item.revision}</small></Link>)}</section>
      {pageCount > 1 ? <nav className={styles.pagination} aria-label="챔피언 목록 페이지">{query!.page > 1 ? <Link href={`/admin/champions?page=${query!.page - 1}&pageSize=${query!.pageSize}`}>이전</Link> : <span /> }<strong>{query!.page} / {pageCount}</strong>{query!.page < pageCount ? <Link href={`/admin/champions?page=${query!.page + 1}&pageSize=${query!.pageSize}`}>다음</Link> : <span />}</nav> : null}
    </>}
  </main>;
}
