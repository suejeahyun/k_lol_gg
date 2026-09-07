import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toPublicGalleryDto } from "@/modules/media";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import styles from "../../media.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "갤러리 상세" };
export default async function GalleryDetail({ params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params; const result = await loadRuntimeMedia((service) => service.getPublicGallery(imageId));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <div className={`page-wrap ${styles.detail}`}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles /><h2>갤러리를 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p></section></div>;
  const gallery = toPublicGalleryDto(result.data!, (id) => `/api/media/assets/${id}`);
  return <article className={`page-wrap ${styles.detail}`}><header className={styles.detailHeader}>{gallery.showOnHome ? <span className={styles.tag}>HOME GALLERY</span> : <span className={styles.tag}>GALLERY</span>}<h1>{gallery.title}</h1><p>{gallery.description}</p></header><div className={styles.galleryDetail}>{gallery.images.map((image, index) => <div className={styles.galleryImage} key={image.assetId}><Image unoptimized fill sizes="(max-width: 640px) 100vw, 50vw" src={image.url} alt={`${gallery.title} ${index + 1}번째 이미지`} /></div>)}</div><div><Link className={styles.back} href="/images"><ArrowLeft size={17} /> 목록으로</Link></div></article>;
}
