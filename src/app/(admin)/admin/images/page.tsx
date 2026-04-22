import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import GalleryImageDeleteButton from "@/features/gallery/GalleryImageDeleteButton";

export default async function AdminImagesPage() {
  const images = await prisma.galleryImage.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이미지 관리</h1>
          <p className="admin-page__description">
            이미지 게시물을 등록, 수정, 삭제할 수 있습니다.
          </p>
        </div>

        <Link href="/admin/images/new" className="admin-page__create-button">
          이미지 등록
        </Link>
      </div>

      <div className="gallery-admin-list">
        {images.length === 0 ? (
          <div className="gallery-admin-list__empty">
            등록된 이미지가 없습니다.
          </div>
        ) : (
          images.map((image) => (
            <div key={image.id} className="gallery-admin-card">
              <div className="gallery-admin-card__thumbnail-wrap">
                <img
                  src={image.imageUrl}
                  alt={image.title}
                  className="gallery-admin-card__thumbnail"
                />
              </div>

              <div className="gallery-admin-card__content">
                <div className="gallery-admin-card__date">
                  {new Date(image.createdAt).toLocaleDateString("ko-KR")}
                </div>

                <h2 className="gallery-admin-card__title">
                  {image.title}
                </h2>

                <p className="gallery-admin-card__summary">
                  {image.description.length > 140
                    ? `${image.description.slice(0, 140)}...`
                    : image.description}
                </p>
              </div>

              <div className="gallery-admin-card__actions">
                {/* 수정 버튼 */}
                <Link
                  href={`/admin/images/${image.id}/edit`}
                  className="gallery-admin-card__edit-button"
                >
                  수정
                </Link>

                {/* 삭제 버튼 */}
                <GalleryImageDeleteButton imageId={image.id} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}