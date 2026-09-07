import Link from "next/link";
import { FileImage, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

import type { PrivateAssetMetadataDto } from "@/modules/assets/application/private-asset-dto";
import { PrivateAssetError } from "@/modules/assets/domain/private-asset";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { adminPrivateAssetActor, parsePrivateAssetAdminListQuery } from "@/modules/media/infrastructure/media-asset-http";
import { getRuntimeAdminPrivateAssetService } from "@/modules/media/infrastructure/media-private-assets";

import { AdminPrivateAssetDelete } from "./admin-private-asset-delete";
import styles from "./admin-media.module.css";

type PageState<T> = { state: "ready"; data: T } | { state: "error" | "unavailable" };

function tabs() { return <nav className={styles.tabs} aria-label="미디어 관리"><Link href="/admin/highlights">하이라이트</Link><Link href="/admin/images">갤러리</Link><Link data-active="true" href="/admin/private-assets">비공개 자산</Link><Link href="/admin/champions">챔피언</Link></nav>; }
function label(value: string) { return value.replaceAll("_", " "); }

export async function AdminPrivateAssetListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/private-assets");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (typeof value === "string") params.set(key, value);
  }
  const query = parsePrivateAssetAdminListQuery(`http://local/admin/private-assets?${params}`);
  const service = getRuntimeAdminPrivateAssetService();
  let result: PageState<Awaited<ReturnType<NonNullable<typeof service>["list"]>>> = { state: "unavailable" };
  if (query && service) {
    try { result = { state: "ready", data: await service.list(adminPrivateAssetActor(session), query) }; }
    catch { result = { state: "error" }; }
  } else if (!query) result = { state: "error" };

  return <main className={styles.page}><header className={styles.header}><div><strong>보호된 원본 관리</strong><h1>비공개 자산</h1><p>허용된 운영 목적의 메타데이터만 표시하며 저장소 위치와 해시는 노출하지 않습니다.</p></div></header>{tabs()}
    <form className={styles.filters} action="/admin/private-assets">
      <label>상태<select name="status" defaultValue={query?.status ?? ""}><option value="">전체</option><option value="STAGED">STAGED</option><option value="READY">READY</option><option value="DELETE_PENDING">DELETE_PENDING</option></select></label>
      <label>목적<select name="purpose" defaultValue={query?.purpose ?? ""}><option value="">허용된 전체</option><option value="MATCH_SCOREBOARD">MATCH SCOREBOARD</option><option value="INHOUSE_RESULT">INHOUSE RESULT</option><option value="DISCIPLINE_ISSUE">DISCIPLINE ISSUE</option><option value="DISCIPLINE_RESOLUTION">DISCIPLINE RESOLUTION</option><option value="GALLERY">GALLERY</option><option value="HIGHLIGHT_THUMBNAIL">HIGHLIGHT THUMBNAIL</option></select></label>
      <label>연결 종류<select name="resourceType" defaultValue={query?.resourceType ?? ""}><option value="">전체</option><option value="MATCH_SUBMISSION">MATCH SUBMISSION</option><option value="INHOUSE_RESULT">INHOUSE RESULT</option><option value="DISCIPLINE_TASK">DISCIPLINE TASK</option><option value="GALLERY_ENTRY">GALLERY ENTRY</option><option value="HIGHLIGHT">HIGHLIGHT</option></select></label>
      <input type="hidden" name="pageSize" value={query?.pageSize ?? 24} /><button className={styles.submit}>적용</button>
    </form>
    {result.state !== "ready" ? <section className={styles.state} role="alert"><ShieldCheck /><h2>{result.state === "unavailable" ? "비공개 자산 서비스를 사용할 수 없습니다." : "자산 목록을 불러오지 못했습니다."}</h2><p>데이터베이스 연결과 검색 조건을 확인해 주세요.</p></section> : result.data.items.length === 0 ? <section className={styles.state}><FileImage /><h2>조건에 맞는 자산이 없습니다.</h2><p>미디어 편집 화면에서 이미지를 올리면 안전 검사 후 이 목록에 나타납니다.</p></section> : <>
      <div className={styles.assetGrid}>{result.data.items.map((asset) => <Link className={styles.assetCard} href={`/admin/private-assets/${asset.assetId}`} key={asset.assetId}><div><span className={styles.badge}>{label(asset.status)}</span><span>{label(asset.purpose)}</span></div><strong>{asset.width} × {asset.height}</strong><p>{label(asset.resourceType)} · {(asset.byteSize / 1024).toFixed(0)} KB</p><time>{new Date(asset.createdAt).toLocaleString("ko-KR")}</time></Link>)}</div>
      {result.data.nextCursor ? <Link className={styles.moreLink} href={`/admin/private-assets?${new URLSearchParams({ ...(query?.purpose ? { purpose: query.purpose } : {}), ...(query?.status ? { status: query.status } : {}), ...(query?.resourceType ? { resourceType: query.resourceType } : {}), pageSize: String(query?.pageSize ?? 24), cursor: result.data.nextCursor }).toString()}`}>다음 자산 보기</Link> : null}
    </>}
  </main>;
}

export async function AdminPrivateAssetDetailPage({ assetId }: { assetId: string }) {
  const path = `/admin/private-assets/${assetId}`;
  const session = await requirePageRole("ADMIN", path);
  const service = getRuntimeAdminPrivateAssetService();
  let result: PageState<PrivateAssetMetadataDto> = { state: "unavailable" };
  if (service) {
    try { result = { state: "ready", data: await service.metadata(adminPrivateAssetActor(session), assetId) }; }
    catch (error) { if (error instanceof PrivateAssetError) notFound(); result = { state: "error" }; }
  }
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role="alert"><ShieldCheck /><h1>{result.state === "unavailable" ? "비공개 자산 서비스를 사용할 수 없습니다." : "자산 정보를 불러오지 못했습니다."}</h1><p>데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p></section></main>;
  const asset = result.data;
  return <main className={styles.page}><header className={styles.header}><div><strong>{label(asset.status)}</strong><h1>비공개 자산 상세</h1><p>권한이 확인된 관리자에게 필요한 메타데이터만 보여 줍니다.</p></div><Link href="/admin/private-assets">목록으로</Link></header>{tabs()}
    <section className={styles.detailCard}><dl><div><dt>목적</dt><dd>{label(asset.purpose)}</dd></div><div><dt>연결 리소스</dt><dd>{label(asset.resourceType)}</dd></div><div><dt>리소스 ID</dt><dd>{asset.resourceId}</dd></div><div><dt>형식</dt><dd>{asset.contentType}</dd></div><div><dt>크기</dt><dd>{asset.width} × {asset.height} · {(asset.byteSize / 1024).toFixed(0)} KB</dd></div><div><dt>생성</dt><dd>{new Date(asset.createdAt).toLocaleString("ko-KR")}</dd></div><div><dt>READY</dt><dd>{asset.readyAt ? new Date(asset.readyAt).toLocaleString("ko-KR") : "아직 준비되지 않음"}</dd></div></dl>
      {asset.status === "READY" ? <a className={styles.previewLink} href={`/api/admin/private-assets/${asset.assetId}`} rel="noreferrer" target="_blank">권한 확인 후 원본 보기</a> : <p className={styles.notice}>READY 상태가 아니므로 원본 읽기는 닫혀 있습니다.</p>}
      <AdminPrivateAssetDelete assetId={asset.assetId} disabled={asset.status === "DELETE_PENDING"} />
    </section>
  </main>;
}
