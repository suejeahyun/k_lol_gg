import type { Metadata } from "next";
import { cache } from "react";
import { BackToList } from "@/components/navigation/list-return";
import { createPublicMetadata, createNoIndexMetadata } from "@/modules/seo/domain/site-seo";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "@/components/theme/theme-icons";
import { toPublicGalleryDto } from "@/modules/media";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import { buildLegacyCanonicalIdDestination } from "@/modules/navigation/application/legacy-user-redirects";
import { parseLegacyIntegerId } from "@/platform/legacy-identifiers";
import styles from "../../media.module.css";
import { MediaCarousel } from "../../media-carousel";

export const dynamic = "force-dynamic";
const loadDetail = cache((id: string) => loadRuntimeMedia((service) => service.getPublicGallery(id)));

export async function generateMetadata({ params }: { params: Promise<{ imageId: string }> }): Promise<Metadata> {
  const { imageId: id } = await params;
  const result = await loadDetail(id);
  if (result.state !== "ready" || !result.data) return createNoIndexMetadata({ title: "정보 확인", description: "현재 공개 정보를 확인할 수 없습니다." });
  return createPublicMetadata({ title: result.data.title, description: result.data.description || "공개 내전 사진과 추억을 확인하세요.", canonical: `/images/${encodeURIComponent(id)}` });
}
export default async function GalleryDetail({ params }: { params: Promise<{ imageId: string }> }) {
  const { imageId: rawImageId } = await params;
  if (parseLegacyIntegerId(rawImageId) !== null) {
    const mapping = await loadRuntimeMedia((service) => service.resolvePublicGalleryLegacyId(rawImageId));
    if (mapping.state === "ready") {
      if (!mapping.data) notFound();
      permanentRedirect(buildLegacyCanonicalIdDestination("/images", mapping.data, "/images"));
    }
  }
  const imageId = rawImageId; const result = await loadDetail(imageId);
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <div className={`page-wrap ${styles.detail}`}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles /><h1>갤러리를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p></section></div>;
  const gallery = toPublicGalleryDto(result.data!, (id) => `/api/media/assets/${id}`);
  return <article className={`page-wrap ${styles.detail}`}><header className={styles.detailHeader}><h1>{gallery.title}</h1><p>{gallery.description}</p></header><MediaCarousel label={`${gallery.title} 사진`} sizes="(max-width: 640px) 100vw, min(1120px, 100vw)" slides={gallery.images.map((image, index) => ({ id: image.assetId, src: image.url, alt: `${gallery.title} ${index + 1}번째 이미지` }))} /><div><BackToList className={styles.back} href="/images"><ArrowLeft size={17} /> 목록으로</BackToList></div></article>;
}
