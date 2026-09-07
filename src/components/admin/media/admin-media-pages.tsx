import Link from "next/link";
import { notFound } from "next/navigation";
import { Images, Plus, Sparkles } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseMediaAdminListQuery } from "@/modules/media";
import type { GalleryContent, HighlightContent, MediaAdminList } from "@/modules/media";
import { isRuntimeMediaAssetUploadAvailable } from "@/modules/media/infrastructure/media-private-assets";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";

import { AdminMediaForm } from "./admin-media-form";
import styles from "./admin-media.module.css";

export async function AdminMediaListPage({ kind, searchParams }: { kind: "highlight" | "gallery"; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const path = kind === "highlight" ? "/admin/highlights" : "/admin/images"; await requirePageRole("ADMIN", path);
  const raw = await searchParams; const params = new URLSearchParams(); for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry)); else if (typeof value === "string") params.set(key, value); }
  const query = parseMediaAdminListQuery(`http://local${path}?${params}`);
  const result = query ? await loadRuntimeMedia<MediaAdminList<HighlightContent | GalleryContent>>(async (service) =>
    kind === "highlight" ? service.listAdminHighlights(query) : service.listAdminGalleries(query)) : { state: "error" as const };
  const label = kind === "highlight" ? "하이라이트" : "갤러리";
  return <main className={styles.page}><header className={styles.header}><div><strong>콘텐츠·자료</strong><h1>{label} 관리</h1><p>draft, 게시, 보관 상태와 공개 자산 연결을 관리합니다.</p></div><Link href={`${path}/new`}><Plus size={17} /> 새 {label}</Link></header><MediaTabs active={kind} /><form className={styles.filters} action={path}><label>게시 상태<select name="status" defaultValue={query?.status ?? ""}><option value="">전체</option><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="ARCHIVED">ARCHIVED</option></select></label><input type="hidden" name="pageSize" value={query?.pageSize ?? 20} /><button type="submit" className={styles.submit}>적용</button></form>
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles /><h2>{label} 데이터를 불러오지 못했습니다.</h2><p>데이터베이스 연결과 검색 조건을 확인해 주세요.</p></section> : result.data.items.length === 0 ? <section className={styles.state}><Images /><h2>등록된 {label}가 없습니다.</h2><p>새 초안을 만들면 이곳에서 관리할 수 있습니다.</p></section> : <div className={styles.list}>{result.data.items.map((item) => <Link className={styles.item} href={`${path}/${item.id}/edit`} key={item.id}><div><h2>{item.title}</h2><p>{item.description}</p></div><span className={styles.badge}>{item.status}</span><span>rev. {item.revision}</span></Link>)}</div>}
  </main>;
}

export async function AdminMediaNewPage({ kind }: { kind: "highlight" | "gallery" }) {
  const path = kind === "highlight" ? "/admin/highlights/new" : "/admin/images/new"; await requirePageRole("ADMIN", path);
  const label = kind === "highlight" ? "하이라이트" : "갤러리";
  return <main className={styles.page}><header className={styles.header}><div><strong>새 콘텐츠</strong><h1>{label} 초안 만들기</h1><p>게시 전 자산 상태와 공개 문구를 다시 확인할 수 있습니다.</p></div></header><MediaTabs active={kind} /><AdminMediaForm kind={kind} uploadAvailable={isRuntimeMediaAssetUploadAvailable()} /></main>;
}

export async function AdminMediaEditorPage({ kind, id }: { kind: "highlight" | "gallery"; id: string }) {
  const path = kind === "highlight" ? `/admin/highlights/${id}/edit` : `/admin/images/${id}/edit`; await requirePageRole("ADMIN", path);
  const result = await loadRuntimeMedia<HighlightContent | GalleryContent | null>(async (service) =>
    kind === "highlight" ? service.getAdminHighlight(id) : service.getAdminGallery(id));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role="alert"><Sparkles /><h2>콘텐츠를 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section></main>;
  return <main className={styles.page}><header className={styles.header}><div><strong>{result.data!.status} · rev. {result.data!.revision}</strong><h1>{result.data!.title}</h1><p>모든 변경은 If-Match와 멱등성 키로 보호되며 보관은 원장을 삭제하지 않습니다.</p></div></header><MediaTabs active={kind} />{kind === "highlight" ? <AdminMediaForm kind="highlight" initial={result.data as import("@/modules/media").HighlightContent} uploadAvailable={isRuntimeMediaAssetUploadAvailable()} /> : <AdminMediaForm kind="gallery" initial={result.data as import("@/modules/media").GalleryContent} uploadAvailable={isRuntimeMediaAssetUploadAvailable()} />}</main>;
}

function MediaTabs({ active }: { active: "highlight" | "gallery" }) { return <nav className={styles.tabs} aria-label="미디어 관리"><Link data-active={active === "highlight"} href="/admin/highlights">하이라이트</Link><Link data-active={active === "gallery"} href="/admin/images">갤러리</Link><Link href="/admin/private-assets">비공개 자산</Link><Link href="/admin/champions">챔피언</Link></nav>; }
