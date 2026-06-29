export const dynamic = "force-dynamic";

import SafeHighlightThumbnail from "@/components/SafeHighlightThumbnail";
import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls, getGalleryThumbnailUrl } from "@/lib/gallery/winner-image-paths";
import { extractYoutubeId } from "@/lib/youtube";

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function HighlightsPage() {
  const [highlights, winnerImages] = await Promise.all([
    prisma.highlight.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.galleryImage.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 6,
    }),
  ]);

  return (
    <main className="page-container highlights-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">K-LOL CLIP</p>
          <h1 className="page-title">하이라이트</h1>
          <p className="page-description">
            멸망전 우승자 이미지와 하이라이트 영상을 한 곳에서 확인합니다.
          </p>
        </div>
      </div>

      <section className="highlight-section highlight-section--winner-images highlight-section--first">
        <div className="highlight-section__head">
          <div>
            <p className="highlight-section__eyebrow">WINNER GALLERY</p>
            <h2>멸망전 우승자 이미지</h2>
            <p>
              우승 이미지 관리에 등록된 멸망전 우승자 이미지를 먼저 확인합니다.
            </p>
          </div>
        </div>

        {winnerImages.length === 0 ? (
          <div className="empty-box">등록된 우승 이미지가 없습니다.</div>
        ) : (
          <div className="highlight-winner-image-list">
            {winnerImages.map((image) => {
              const imageList = coerceGalleryImageUrls(image.imageUrl);
              const thumbnail = getGalleryThumbnailUrl(image.imageUrl);

              return (
                <Link
                  key={image.id}
                  href={`/images/${image.id}`}
                  className="highlight-winner-image-card"
                >
                  <div className="highlight-winner-image-card__thumb-wrap">
                    {thumbnail ? (
                      <SafeGalleryImage
                        src={thumbnail}
                        alt={image.title}
                        width={480}
                        height={270}
                        className="highlight-winner-image-card__thumb"
                      />
                    ) : (
                      <div className="highlight-winner-image-card__empty">
                        이미지 없음
                      </div>
                    )}
                  </div>

                  <div className="highlight-winner-image-card__body">
                    <div className="highlight-card__meta">
                      <span>{formatDate(image.createdAt)}</span>
                      <span>{imageList.length}장</span>
                    </div>
                    <h3>{image.title}</h3>
                    <p>{image.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <section className="highlight-section highlight-section--videos">
        <div className="highlight-section__head">
          <div>
            <p className="highlight-section__eyebrow">YOUTUBE HIGHLIGHT</p>
            <h2>하이라이트 영상</h2>
          </div>
        </div>

        {highlights.length === 0 ? (
          <div className="empty-box">등록된 하이라이트가 없습니다.</div>
        ) : (
          <div className="highlight-list">
            {highlights.map((highlight) => {
              const safeYoutubeId = highlight.youtubeId || extractYoutubeId(highlight.youtubeUrl) || "";

              return (
              <Link
                key={highlight.id}
                href={`/highlights/${highlight.id}`}
                className="highlight-card"
              >
                <div className="highlight-card__thumb-wrap">
                  <SafeHighlightThumbnail
                    youtubeId={safeYoutubeId}
                    thumbnailUrl={highlight.thumbnailUrl}
                    alt={highlight.title}
                    width={640}
                    height={360}
                    className="highlight-card__thumb"
                  />
                  <span className="highlight-card__play">▶</span>
                </div>

                <div className="highlight-card__body">
                  <div className="highlight-card__meta">
                    <span>{formatDate(highlight.createdAt)}</span>
                    <span>YouTube</span>
                  </div>
                  <h2>{highlight.title}</h2>
                  <p>{highlight.description}</p>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </section>

    </main>
  );
}
