import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import GalleryImageDeleteButton from "@/features/gallery/GalleryImageDeleteButton";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function AdminImagesPage() {
  const images = await prisma.galleryImage.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">멸망전 우승팀 관리</h1>
          <p className="admin-page__description">
            메인 화면에 노출할 우승팀 이미지를 선택할 수 있습니다.
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
            const imageList = Array.isArray(image.imageUrl)
              ? image.imageUrl
              : [];

            const thumbnail = imageList[0] ?? "";

            return (
              <div key={image.id} className="gallery-admin-card">
                <div className="gallery-admin-card__thumbnail-wrap">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={image.title}
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
                    {new Date(image.createdAt).toLocaleDateString("ko-KR")}
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
                  <form
                    action={`/api/gallery-images/${image.id}/home-display`}
                    method="post"
                  >
                    <button
                      type="submit"
                      className={
                        image.showOnHome
                          ? "chip-button chip-button--home-active"
                          : "chip-button"
                      }
                    >
                      {image.showOnHome ? "메인 해제" : "메인 표시"}
                    </button>
                  </form>

                  <Link
                    href={`/admin/images/${image.id}/edit`}
                    className="chip-button"
                  >
                    수정
                  </Link>

                  <GalleryImageDeleteButton imageId={image.id} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}