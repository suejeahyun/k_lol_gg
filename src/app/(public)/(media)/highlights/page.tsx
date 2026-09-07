import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clapperboard, CloudSun, Play, Sparkles } from "lucide-react";

import { parseMediaPublicListQuery, toPublicHighlightDto } from "@/modules/media";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";

import styles from "../media.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "하이라이트", description: "K-LOL.GG의 공개 경기 하이라이트를 봅니다.", alternates: { canonical: "/highlights" } };

export default async function HighlightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams; const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry)); else if (typeof value === "string") params.set(key, value); }
  const query = parseMediaPublicListQuery(`http://local/highlights?${params}`);
  const result = query ? await loadRuntimeMedia((service) => service.listPublicHighlights(query)) : { state: "error" as const };
  const items = result.state === "ready" ? result.data.items.map((item) => toPublicHighlightDto(item, (id) => `/api/media/assets/${id}`)) : [];
  return <div className={`page-wrap ${styles.page}`}>
    <section className={styles.hero}><div className={styles.heroText}><p className={styles.eyebrow}>K-LOL MOMENTS</p><h1>우리의 반짝이는 장면</h1><span>웃음과 역전, 멋진 플레이를 가볍게 다시 만나 보세요.</span></div><Clapperboard aria-hidden="true" /></section>
    <div className={styles.heading}><div><p className={styles.eyebrow}>HIGHLIGHTS</p><h2>최신 하이라이트</h2></div><strong>{result.state === "ready" ? `${items.length}개` : "—"}</strong></div>
    {result.state === "unavailable" ? <State icon={<CloudSun />} title="영상 보관함을 연결하고 있어요." body="샘플 영상은 대신 표시하지 않습니다." />
      : result.state === "error" ? <State icon={<Sparkles />} title="하이라이트를 불러오지 못했어요." body="주소를 확인하거나 잠시 후 다시 시도해 주세요." alert />
      : items.length === 0 ? <State icon={<Play />} title="공개된 하이라이트가 아직 없어요." body="첫 영상이 게시되면 이곳에서 만날 수 있습니다." />
      : <><div className={styles.grid}>{items.map((item) => <Link className={styles.card} href={`/highlights/${item.id}`} key={item.id}><div className={styles.visual}><Image unoptimized fill sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 33vw" src={item.thumbnailUrl} alt="" /></div><div className={styles.cardBody}><span className={styles.tag}>PLAY</span><h2>{item.title}</h2><p>{item.description}</p></div></Link>)}</div>{result.data.nextCursor ? <nav className={styles.pager}><Link href={`/highlights?cursor=${result.data.nextCursor}&pageSize=${query?.pageSize ?? 12}`}>다음 영상 보기</Link></nav> : null}</>}
  </div>;
}

function State({ icon, title, body, alert = false }: { icon: React.ReactNode; title: string; body: string; alert?: boolean }) {
  return <section className={styles.state} role={alert ? "alert" : "status"}>{icon}<h2>{title}</h2><p>{body}</p></section>;
}
