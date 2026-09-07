import type { Metadata } from "next";
import Link from "next/link";
import { CloudSun, Images, Sparkles } from "lucide-react";
import { parseMediaPublicListQuery, toPublicGalleryDto } from "@/modules/media";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import styles from "../media.module.css";
import { ResilientMediaImage } from "../resilient-media-image";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이미지 갤러리", description: "K-LOL.GG의 공개 갤러리를 봅니다.", alternates: { canonical: "/images" } };

export default async function ImagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams; const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((entry) => queryParams.append(key, entry)); else if (typeof value === "string") queryParams.set(key, value); }
  const query = parseMediaPublicListQuery(`http://local/images?${queryParams}`);
  const result = query ? await loadRuntimeMedia((service) => service.listPublicGalleries(query)) : { state: "error" as const };
  const items = result.state === "ready" ? result.data.items.map((item) => toPublicGalleryDto(item, (id) => `/api/media/assets/${id}`)) : [];
  return <div className={`page-wrap ${styles.page}`}><section className={styles.hero}><div className={styles.heroText}><p className={styles.eyebrow}>K-LOL GALLERY</p><h1>함께 남긴 포근한 기록</h1><span>우승 순간과 즐거운 추억을 한 장씩 펼쳐 보세요.</span></div><Images aria-hidden="true" /></section><div className={styles.heading}><div><p className={styles.eyebrow}>GALLERIES</p><h2>공개 갤러리</h2></div><strong>{result.state === "ready" ? `${items.length}개` : "—"}</strong></div>
    {result.state === "unavailable" ? <State icon={<CloudSun />} title="갤러리를 확인할 수 없어요." body="잠시 후 다시 확인해 주세요." /> : result.state === "error" ? <State icon={<Sparkles />} title="갤러리를 불러오지 못했어요." body="주소를 확인하거나 잠시 후 다시 시도해 주세요." alert /> : items.length === 0 ? <State icon={<Images />} title="공개된 갤러리가 아직 없어요." body="첫 추억이 게시되면 이곳에 표시됩니다." /> : <><div className={styles.grid}>{items.map((item) => <Link className={styles.card} href={`/images/${item.id}`} key={item.id}><div className={styles.visual}><ResilientMediaImage sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 33vw" src={item.images[0]!.url} alt="" /></div><div className={styles.cardBody}>{item.showOnHome ? <span className={styles.tag}>HOME</span> : null}<h2>{item.title}</h2><p>{item.description}</p></div></Link>)}</div>{result.data.nextCursor ? <nav className={styles.pager}><Link href={`/images?cursor=${result.data.nextCursor}&pageSize=${query?.pageSize ?? 12}`}>다음 갤러리 보기</Link></nav> : null}</>}
  </div>;
}
function State({ icon, title, body, alert = false }: { icon: React.ReactNode; title: string; body: string; alert?: boolean }) { return <section className={styles.state} role={alert ? "alert" : "status"}>{icon}<h2>{title}</h2><p>{body}</p></section>; }
