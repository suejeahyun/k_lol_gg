export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import ImageSlider from "@/components/ImageSlider";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";

type ImageDetailPageProps = {
  params: Promise<{
    imageId: string;
  }>;
};

export async function generateMetadata({ params }: ImageDetailPageProps): Promise<Metadata> {
  const { imageId } = await params;
  return {
    title: "우승 이미지 상세",
    description: "K-LOL.GG 멸망전 우승 이미지와 설명을 확인하세요.",
    alternates: { canonical: `/images/${imageId}` },
  };
}

export default async function ImageDetailPage({
  params,
}: ImageDetailPageProps) {
  const { imageId } = await params;
  const id = Number(imageId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const image = await prisma.galleryImage.findUnique({
    where: { id },
  });

  if (!image) {
    notFound();
  }

  const imageList = coerceGalleryImageUrls(image.imageUrl);

  return (
    <main className="gallery-detail">
      <div className="gallery-detail__header">
        <h1 className="gallery-detail__title">{image.title}</h1>

        <div className="gallery-detail__meta">
          {new Date(image.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
        </div>
      </div>

      <div className="gallery-detail__image-wrap">
        {imageList.length > 0 ? (
          <ImageSlider images={imageList} title={image.title} />
        ) : (
          <div className="gallery-detail__image-empty">
            등록된 이미지가 없습니다.
          </div>
        )}
      </div>

      <div className="gallery-detail__content">
        {image.description.split("\n").map((line, index) => (
          <p key={`${image.id}-${index}`}>{line}</p>
        ))}
      </div>
    </main>
  );
}
