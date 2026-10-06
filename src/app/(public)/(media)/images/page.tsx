import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { CloudSun, Images, Sparkles } from "@/components/theme/theme-icons";
import { parseMediaPublicListQuery, toPublicGalleryDto } from "@/modules/media";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import styles from "../media.module.css";
import { ResilientMediaImage } from "../resilient-media-image";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/images");

export default async function ImagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams; const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((entry) => queryParams.append(key, entry)); else if (typeof value === "string") queryParams.set(key, value); }
  const query = parseMediaPublicListQuery(`http://local/images?${queryParams}`);
  const result = query ? await loadRuntimeMedia((service) => service.listPublicGalleries(query)) : { state: "error" as const };
  const items = result.state === "ready" ? result.data.items.map((item) => toPublicGalleryDto(item, (id) => `/api/media/assets/${id}`)) : [];
  return <div className={`page-wrap ${styles.page}`}><section className={styles.hero}><div className={styles.heroText}><h1>갤러리</h1></div><Images aria-hidden="true" /></section><div className={styles.heading}><div><h2>공개 갤러리</h2></div><strong>{result.state === "ready" ? `${items.length}개` : "—"}</strong></div>
    {result.state === "unavailable" ? <State icon={<CloudSun />} title="갤러리를 확인할 수 없어요." body="잠시 후 다시 확인해 주세요." /> : result.state === "error" ? <State icon={<Sparkles />} title="갤러리를 불러오지 못했어요." body="주소를 확인하거나 잠시 후 다시 시도해 주세요." alert /> : items.length === 0 ? <State icon={<Images />} title="공개된 갤러리가 아직 없어요." body="첫 추억이 게시되면 이곳에 표시됩니다." /> : <><div className={styles.grid}>{items.map((item) => <Link className={styles.card} data-featured={item.showOnHome ? "true" : "false"} data-media-kind="gallery" href={`/images/${item.id}`} key={item.id}><div className={styles.visual}><ResilientMediaImage sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 33vw" src={item.images[0]!.url} alt="" /><span className={styles.imageCount}>{item.images.length}장</span></div><div className={styles.cardBody}><h2>{item.title}</h2><p>{item.description}</p></div></Link>)}</div>{result.data.nextCursor ? <nav className={styles.pager}><Link href={`/images?cursor=${result.data.nextCursor}&pageSize=${query?.pageSize ?? 12}`}>다음 갤러리 보기</Link></nav> : null}</>}
  </div>;
}
function State({ icon, title, body, alert = false }: { icon: React.ReactNode; title: string; body: string; alert?: boolean }) { return <section className={styles.state} role={alert ? "alert" : "status"}>{icon}<h2>{title}</h2><p>{body}</p></section>; }
