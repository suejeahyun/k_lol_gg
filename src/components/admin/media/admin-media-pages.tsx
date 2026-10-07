import Link from "next/link";
import { notFound } from "next/navigation";
import { Images, Plus, Sparkles } from "@/components/theme/theme-icons";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseMediaAdminListQuery } from "@/modules/media";
import type { GalleryContent, HighlightContent, MediaAdminList } from "@/modules/media";
import { isRuntimeMediaAssetUploadAvailable } from "@/modules/media/infrastructure/media-private-assets";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";

import { AdminMediaForm, type GalleryUploadNavigationReport } from "./admin-media-form";
import styles from "./admin-media.module.css";

const publicationLabel = { DRAFT: "초안", PUBLISHED: "게시됨", ARCHIVED: "보관됨" } as const;

export async function AdminMediaListPage({ kind, searchParams }: { kind: "highlight" | "gallery"; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const path = kind === "highlight" ? "/admin/highlights" : "/admin/images"; await requirePageRole("ADMIN", path);
  const raw = await searchParams; const params = new URLSearchParams(); for (const [key, value] of Object.entries(raw)) { if (key === "status" && value === "") continue; if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry)); else if (typeof value === "string") params.set(key, value); }
  const query = parseMediaAdminListQuery(`http://local${path}?${params}`);
  const result = query ? await loadRuntimeMedia<MediaAdminList<HighlightContent | GalleryContent>>(async (service) =>
    kind === "highlight" ? service.listAdminHighlights(query) : service.listAdminGalleries(query)) : { state: "error" as const };
  const label = kind === "highlight" ? "하이라이트" : "갤러리";
  const pageHref = (page: number) => `${path}?${new URLSearchParams({ page: String(page), pageSize: String(query?.pageSize ?? 20), ...(query?.status ? { status: query.status } : {}) })}`;
  return <main className={styles.page}><header className={styles.header}><div><h1>{label} 관리</h1></div><Link href={`${path}/new`}><Plus aria-hidden="true" size={17} /> 새 {label}</Link></header><AdminContentTabs active={kind} /><form key={`${path}:${query?.page ?? "invalid"}:${query?.status ?? "ALL"}:${query?.pageSize ?? 20}`} className={styles.filters} action={path}><label>게시 상태<select name="status" defaultValue={query?.status ?? ""}><option value="">전체</option><option value="DRAFT">{publicationLabel.DRAFT}</option><option value="PUBLISHED">{publicationLabel.PUBLISHED}</option><option value="ARCHIVED">{publicationLabel.ARCHIVED}</option></select></label><input type="hidden" name="pageSize" value={query?.pageSize ?? 20} /><button type="submit" className={styles.submit}>적용</button></form>
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles aria-hidden="true" /><h2>{query ? `${label} 데이터를 불러오지 못했습니다.` : "목록 조건을 확인해 주세요."}</h2><Link className={styles.submit} href={query ? pageHref(query.page) : path}>{query ? "다시 불러오기" : "목록 초기화"}</Link></section> : result.data.items.length === 0 ? <section className={styles.state} role="status"><Images aria-hidden="true" /><h2>{query?.status ? `조건에 맞는 ${label}가 없습니다.` : `등록된 ${label}가 없습니다.`}</h2>{query?.status ? <Link className={styles.submit} href={`${path}?pageSize=${query.pageSize}`}>전체 보기</Link> : null}</section> : <>
      <div className={styles.list}>{result.data.items.map((item) => <Link className={styles.item} href={`${path}/${item.id}/edit`} key={item.id}><div><h2>{item.title}</h2><p>{item.description}</p></div><span className={styles.badge} data-state={item.status}>{publicationLabel[item.status]}</span><span>변경 버전 {item.revision}</span></Link>)}</div>
      {result.data.totalPages > 1 ? <nav className={styles.pagination} aria-label={`${label} 목록 페이지`}>{result.data.currentPage > 1 ? <Link href={pageHref(result.data.currentPage - 1)}>이전</Link> : <span />}<strong aria-current="page">{result.data.currentPage} / {result.data.totalPages}</strong>{result.data.currentPage < Math.min(result.data.totalPages, 100) ? <Link href={pageHref(result.data.currentPage + 1)}>다음</Link> : <span />}</nav> : null}
    </>}
  </main>;
}

export async function AdminMediaNewPage({ kind }: { kind: "highlight" | "gallery" }) {
  const path = kind === "highlight" ? "/admin/highlights/new" : "/admin/images/new"; await requirePageRole("ADMIN", path);
  const label = kind === "highlight" ? "하이라이트" : "갤러리";
  return <main className={styles.page}><header className={styles.header}><div><h1>{label} 초안 만들기</h1></div></header><AdminContentTabs active={kind} /><AdminMediaForm kind={kind} uploadAvailable={isRuntimeMediaAssetUploadAvailable()} /></main>;
}

export async function AdminMediaEditorPage({ kind, id, initialUploadReport }: { kind: "highlight" | "gallery"; id: string; initialUploadReport?: GalleryUploadNavigationReport }) {
  const path = kind === "highlight" ? `/admin/highlights/${id}/edit` : `/admin/images/${id}/edit`; await requirePageRole("ADMIN", path);
  const result = await loadRuntimeMedia<HighlightContent | GalleryContent | null>(async (service) =>
    kind === "highlight" ? service.getAdminHighlight(id) : service.getAdminGallery(id));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles aria-hidden="true" /><h1>콘텐츠를 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>;
  return <main className={styles.page}><header className={styles.header}><div><strong>{publicationLabel[result.data!.status]} · 변경 버전 {result.data!.revision}</strong><h1>{result.data!.title}</h1><p>보관해도 기록은 유지됩니다.</p></div>{result.data!.status === "PUBLISHED" ? <Link href={`/${kind === "highlight" ? "highlights" : "images"}/${id}`}>공개 화면 보기</Link> : null}</header><AdminContentTabs active={kind} />{kind === "highlight" ? <AdminMediaForm kind="highlight" initial={result.data as import("@/modules/media").HighlightContent} uploadAvailable={isRuntimeMediaAssetUploadAvailable()} /> : <AdminMediaForm kind="gallery" initial={result.data as import("@/modules/media").GalleryContent} initialUploadReport={initialUploadReport} uploadAvailable={isRuntimeMediaAssetUploadAvailable()} />}</main>;
}

export type AdminContentKind = "highlight" | "gallery" | "champion" | "private-assets";

export function AdminContentTabs({ active }: { active: AdminContentKind }) {
  return <nav className={styles.tabs} aria-label="콘텐츠·자료 관리">
    <Link aria-current={active === "highlight" ? "page" : undefined} data-active={active === "highlight"} href="/admin/highlights">하이라이트</Link>
    <Link aria-current={active === "gallery" ? "page" : undefined} data-active={active === "gallery"} href="/admin/images">갤러리</Link>
    <Link aria-current={active === "private-assets" ? "page" : undefined} data-active={active === "private-assets"} href="/admin/private-assets">비공개 자산</Link>
    <Link aria-current={active === "champion" ? "page" : undefined} data-active={active === "champion"} href="/admin/champions">챔피언</Link>
  </nav>;
}
