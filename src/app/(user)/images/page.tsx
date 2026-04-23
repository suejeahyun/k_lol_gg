import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

export default async function ImagesPage() {
  const images = await prisma.galleryImage.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="gallery-page">
      <div className="gallery-page__header">
        <h1 className="gallery-page__title">이미지 목록</h1>
      </div>

      <div className="gallery-list">
        {images.length === 0 ? (
          <div className="gallery-list__empty">등록된 이미지가 없습니다.</div>
        ) : (
          images.map((image) => {
            const imageList = Array.isArray(image.imageUrl) ? image.imageUrl : [];
            const thumbnail = imageList[0] ?? "";

            return (
              <Link
                key={image.id}
                href={`/images/${image.id}`}
                className="gallery-card"
              >
                <div className="gallery-card__image-wrap">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={image.title}
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
                    {new Date(image.createdAt).toLocaleDateString("ko-KR")} ·{" "}
                    {imageList.length}장
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
    </div>
  );
}