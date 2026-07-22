export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";

export const metadata: Metadata = {
  title: "우승 이미지 갤러리",
  description: "K-LOL.GG 멸망전 우승 이미지 갤러리를 확인하세요.",
  alternates: { canonical: "/images" },
};

type ImagesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 12;

export default async function ImagesPage({ searchParams }: ImagesPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = parsePositivePage(resolvedSearchParams.page);

  const totalCount = await prisma.galleryImage.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const images = await prisma.galleryImage.findMany({
    orderBy: [{ createdAt: "desc" }],
    skip: (safeCurrentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      createdAt: true,
    },
  });

  return (
    <main className="gallery-page">
      <div className="gallery-page__header">
        <div>
          <p className="page-eyebrow">WINNER GALLERY</p>
          <h1 className="gallery-page__title">이미지 목록</h1>
        </div>
        <p className="gallery-page__description">총 {totalCount}개 이미지</p>
      </div>

      <div className="gallery-list">
        {images.length === 0 ? (
          <div className="gallery-list__empty">등록된 이미지가 없습니다.</div>
        ) : (
          images.map((image) => {
            const imageList = coerceGalleryImageUrls(image.imageUrl);
            const thumbnail = imageList[0] ?? "";

            return (
              <Link
                key={image.id}
                href={`/images/${image.id}`}
                className="gallery-card"
              >
                <div className="gallery-card__image-wrap" data-count={`${imageList.length}장`}>
                  {thumbnail ? (
                    <SafeGalleryImage
                      src={thumbnail}
                      alt={image.title}
                      width={360}
                      height={220}
                      className="gallery-card__image"
                    />
                  ) : (
                    <div className="gallery-card__image-empty">
                      등록된 이미지가 없습니다.
                    </div>
                  )}
                </div>

                <div className="gallery-card__body">
                  <h2 className="gallery-card__title">{image.title}</h2>

                  <div className="gallery-card__meta">
                    {new Date(image.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} · {imageList.length}장
                  </div>

                  <p className="gallery-card__description">
                    {image.description.length > 100
                      ? `${image.description.slice(0, 100)}...`
                      : image.description}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Pagination currentPage={safeCurrentPage} totalPages={totalPages} basePath="/images" />
    </main>
  );
}
