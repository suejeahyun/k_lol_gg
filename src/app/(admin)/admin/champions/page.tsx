import Link from "next/link";
import { LibraryBig, Plus, Sparkles } from "@/components/theme/theme-icons";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseChampionListQuery } from "@/modules/champions";
import { loadRuntimeChampions } from "@/modules/champions/infrastructure/runtime-champions";
import { AdminContentTabs } from "@/components/admin/media/admin-media-pages";
import { ChampionPortrait } from "@/components/champions/champion-portrait";
import { officialChampionImageUrl } from "@/modules/champions/domain/champion-image";

import styles from "@/components/admin/media/admin-media.module.css";

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
  const pageCount = result.state === "ready" ? Math.min(1_000, Math.max(1, Math.ceil(result.data.total / result.data.pageSize))) : 1;
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(query?.pageSize ?? 30) });
    if (query?.query) params.set("q", query.query);
    if (query?.status) params.set("status", query.status);
    return `/admin/champions?${params}`;
  };
  const resetHref = `/admin/champions?pageSize=${query?.pageSize ?? 30}`;
  return <main className={styles.page}>
    <header className={styles.header}><div><h1>챔피언 관리</h1></div><Link href="/admin/champions/new"><Plus aria-hidden="true" /> 새 챔피언</Link></header>
    <AdminContentTabs active="champion" />
    <form key={`${query?.query ?? ""}:${query?.status ?? ""}:${query?.page ?? "invalid"}:${query?.pageSize ?? 30}`} className={styles.filters} action="/admin/champions"><label>검색<input name="q" defaultValue={query?.query ?? ""} maxLength={80} placeholder="이름 또는 고정 키" /></label><label>상태<select name="status" defaultValue={query?.status ?? ""}><option value="">전체</option><option value="ACTIVE">활성</option><option value="INACTIVE">비활성</option></select></label><input type="hidden" name="pageSize" value={query?.pageSize ?? 30} /><button type="submit" className={styles.submit}>적용</button>{query?.query || query?.status ? <Link href={resetHref}>검색 초기화</Link> : null}</form>
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles aria-hidden="true" /><h2>{query ? "챔피언 목록을 불러오지 못했습니다." : "목록 조건을 확인해 주세요."}</h2>{query ? <a href={pageHref(query.page)}>다시 불러오기</a> : <Link href={resetHref}>목록 초기화</Link>}</section> : result.data.items.length === 0 ? <section className={styles.state} role="status"><LibraryBig aria-hidden="true" /><h2>{result.data.total > 0 ? "현재 페이지에 챔피언이 없습니다." : "조건에 맞는 챔피언이 없습니다."}</h2>{result.data.total > 0 || (query?.page ?? 1) > 1 ? <Link href={pageHref(1)}>첫 페이지로</Link> : null}</section> : <>
      <section className={styles.list} aria-label="챔피언 목록">{result.data.items.map((item) => { const imageState = item.imageUrl === officialChampionImageUrl(item.key, item.displayName) ? "DATA_DRAGON" : "KEY_FALLBACK"; return <Link className={styles.item} href={`/admin/champions/${item.key}/edit`} key={item.key}><div className={styles.championMeta}><ChampionPortrait className={styles.championPortrait} displayName={item.displayName} imageUrl={item.imageUrl} championKey={item.key} /><div><h2>{item.displayName}</h2><p className={styles.code}>고정 키 · {item.key}</p></div></div><span className={styles.badge} data-state={imageState}>{imageState === "DATA_DRAGON" ? "16.17.1 공식 매핑" : "공식 이미지 대체"}</span><span className={styles.badge} data-state={item.status}>{item.status === "ACTIVE" ? "활성" : "비활성"}</span><span>변경 버전 {item.revision}</span></Link>; })}</section>
      {pageCount > 1 ? <nav className={styles.pagination} aria-label="챔피언 목록 페이지">{result.data.page > 1 ? <Link href={pageHref(result.data.page - 1)} rel="prev">이전</Link> : <span aria-disabled="true">이전</span>}<strong aria-current="page">{result.data.page} / {pageCount}</strong>{result.data.page < pageCount ? <Link href={pageHref(result.data.page + 1)} rel="next">다음</Link> : <span aria-disabled="true">다음</span>}</nav> : null}
    </>}
  </main>;
}
