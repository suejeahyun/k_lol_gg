import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { buildLegacyCanonicalIdDestination } from "@/modules/navigation/application/legacy-user-redirects";
import { parseLegacyIntegerId } from "@/platform/legacy-identifiers";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import styles from "../../media.module.css";
import { YouTubePlayer } from "../../youtube-player";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "하이라이트 상세" };

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
  const result = await loadRuntimeMedia((service) => service.getPublicHighlight(highlightId));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <div className={`page-wrap ${styles.detail}`}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles /><h2>영상을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p></section></div>;
  const item = result.data!;
  return <article className={`page-wrap ${styles.detail}`}><header className={styles.detailHeader}><span className={styles.tag}>HIGHLIGHT</span><h1>{item.title}</h1><p>{item.description}</p></header><div className={styles.player}><YouTubePlayer youtubeId={item.youtubeId} title={item.title} /></div><div><Link className={styles.back} href="/highlights"><ArrowLeft size={17} /> 목록으로</Link></div></article>;
}
