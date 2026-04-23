import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

export default async function ImagesPage() {
  const images = await prisma.galleryImage.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="gallery-page">
      <div className="gallery-page__header">
        <h1 className="gallery-page__title">멸망전 우승 팀</h1>
      </div>

      <div className="gallery-grid">
        {images.length === 0 ? (
          <div className="gallery-grid__empty">등록된 이미지가 없습니다.</div>
        ) : (
          images.map((image) => (
            <Link
              key={image.id}
              href={`/images/${image.id}`}
              className="gallery-card"
            >
              <div className="gallery-card__image-wrap">
                <img
                  src={image.imageUrl}
                  alt={image.title}
                  className="gallery-card__image"
                />
              </div>

              <div className="gallery-card__content">
                <h2 className="gallery-card__title">{image.title}</h2>

                <p className="gallery-card__description">
                  {image.description.length > 80
                    ? `${image.description.slice(0, 80)}...`
                    : image.description}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}