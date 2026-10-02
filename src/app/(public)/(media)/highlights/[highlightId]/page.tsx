import type { Metadata } from "next";
import { cache } from "react";
import { BackToList } from "@/components/navigation/list-return";
import { createPublicMetadata, createNoIndexMetadata } from "@/modules/seo/domain/site-seo";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { toPublicHighlightDto } from "@/modules/media";
import { buildLegacyCanonicalIdDestination } from "@/modules/navigation/application/legacy-user-redirects";
import { parseLegacyIntegerId } from "@/platform/legacy-identifiers";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import styles from "../../media.module.css";
import { YouTubePlayer } from "../../youtube-player";

export const dynamic = "force-dynamic";
const loadDetail = cache((id: string) => loadRuntimeMedia((service) => service.getPublicHighlight(id)));

export async function generateMetadata({ params }: { params: Promise<{ highlightId: string }> }): Promise<Metadata> {
  const { highlightId: id } = await params;
  const result = await loadDetail(id);
  if (result.state !== "ready" || !result.data) return createNoIndexMetadata({ title: "정보 확인", description: "현재 공개 정보를 확인할 수 없습니다." });
  return createPublicMetadata({ title: result.data.title, description: result.data.description || "공개 내전 하이라이트를 확인하세요.", canonical: `/highlights/${encodeURIComponent(id)}` });
}

export default async function HighlightDetail({ params }: { params: Promise<{ highlightId: string }> }) {
  const { highlightId: rawHighlightId } = await params;
  if (parseLegacyIntegerId(rawHighlightId) !== null) {
    const mapping = await loadRuntimeMedia((service) => service.resolvePublicHighlightLegacyId(rawHighlightId));
    if (mapping.state === "ready") {
      if (!mapping.data) notFound();
      permanentRedirect(buildLegacyCanonicalIdDestination("/highlights", mapping.data, "/highlights"));
    }
  }
  const highlightId = rawHighlightId;
  const result = await loadDetail(highlightId);
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <div className={`page-wrap ${styles.detail}`}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles /><h1>영상을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></div>;
  const item = toPublicHighlightDto(result.data!, (id) => `/api/media/assets/${id}`);
  return <article className={`page-wrap ${styles.detail}`}><header className={styles.detailHeader}><span className={styles.tag}>HIGHLIGHT</span><h1>{item.title}</h1><p>{item.description}</p></header><div className={styles.player}><YouTubePlayer youtubeId={item.youtubeId} title={item.title} /></div><div className={styles.detailActions}><BackToList className={styles.back} href="/highlights"><ArrowLeft size={17} /> 목록으로</BackToList><a className={styles.back} href={item.youtubeWatchUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" /> YouTube에서 보기<span className="sr-only"> (새 탭)</span></a></div></article>;
}
