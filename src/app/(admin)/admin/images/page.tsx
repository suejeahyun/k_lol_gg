import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import GalleryImageDeleteButton from "@/features/gallery/GalleryImageDeleteButton";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";
export const dynamic = "force-dynamic";

type AdminImagesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 10;

export default async function AdminImagesPage({ searchParams }: AdminImagesPageProps) {
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
      showOnHome: true,
      createdAt: true,
    },
  });

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">멸망전 우승팀 관리</h1>
          <p className="admin-page__description">
            메인 화면에 노출할 우승팀 이미지를 선택할 수 있습니다. 총 {totalCount}개
          </p>
        </div>

        <Link href="/admin/images/new" className="admin-page__create-button">
          이미지 추가
        </Link>
      </div>

      <div className="gallery-admin-list">
        {images.length === 0 ? (
          <div className="gallery-admin-list__empty">
            등록된 이미지가 없습니다.
          </div>
        ) : (
          images.map((image) => {
            const imageList = coerceGalleryImageUrls(image.imageUrl);
            const thumbnail = imageList[0] ?? "";

            return (
              <div key={image.id} className="gallery-admin-card">
                <div className="gallery-admin-card__thumbnail-wrap">
                  {thumbnail ? (
                    <SafeGalleryImage
                      src={thumbnail}
                      alt={image.title}
                      width={320}
                      height={180}
                      className="gallery-admin-card__thumbnail"
                    />
                  ) : (
                    <div className="gallery-admin-card__thumbnail gallery-admin-card__thumbnail--empty">
                      이미지 없음
                    </div>
                  )}
                </div>

                <div className="gallery-admin-card__content">
                  <div className="gallery-admin-card__date">
                    {new Date(image.createdAt).toLocaleDateString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </div>

                  <h2 className="gallery-admin-card__title">{image.title}</h2>

                  <p className="gallery-admin-card__summary">
                    {image.description.length > 140
                      ? `${image.description.slice(0, 140)}...`
                      : image.description}
                  </p>

                  <div className="gallery-admin-card__count">
                    등록 이미지 수: {imageList.length}장
                  </div>

                  <div className="gallery-admin-card__home-state">
                    {image.showOnHome ? "메인 노출 중" : "메인 미노출"}
                  </div>
                </div>

                <div className="gallery-admin-card__actions">
                  <form action={`/api/gallery-images/${image.id}/home-display`} method="post">
                    <button
                      type="submit"
                      className={image.showOnHome ? "chip-button chip-button--home-active" : "chip-button"}
                    >
                      {image.showOnHome ? "메인 해제" : "메인 표시"}
                    </button>
                  </form>

                  <Link href={`/admin/images/${image.id}/edit`} className="chip-button">
                    수정
                  </Link>

                  <GalleryImageDeleteButton imageId={image.id} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <Pagination currentPage={safeCurrentPage} totalPages={totalPages} basePath="/admin/images" />
    </div>
  );
}
