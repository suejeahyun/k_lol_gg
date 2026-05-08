export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export default async function DestructionImagesPage({ params }: PageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    include: {
      galleryImage: true,
    },
  });

  if (!tournament) {
    notFound();
  }

  const images = tournament.galleryImage?.imageUrl ?? [];

  return (
    <main className="page-container destruction-content-detail-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">DESTRUCTION IMAGES</p>
          <h1 className="page-title">{tournament.title} 이미지 목록</h1>
          <p className="page-description">
            등록된 멸망전 이미지를 목록으로 확인하고, 이미지를 선택하면 상세 페이지로 이동합니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href={`/progress/destruction/${tournament.id}`} className="btn btn-ghost">
            멸망전 상세로
          </Link>
          <Link href="/progress/destruction/contents" className="btn btn-ghost">
            콘텐츠 목록으로
          </Link>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="empty-box">등록된 멸망전 이미지가 없습니다.</div>
      ) : (
        <section className="destruction-content-list-grid">
          {images.map((imageUrl, index) => (
            <Link
              key={`${imageUrl}-${index}`}
              href={`/progress/destruction/${tournament.id}/images/${index + 1}`}
              className="destruction-image-list-card"
            >
              <div className="destruction-image-list-card__media">
                <Image
                  src={imageUrl}
                  alt={`${tournament.galleryImage?.title ?? tournament.title} ${index + 1}`}
                  width={900}
                  height={540}
                  className="destruction-image-list-card__image"
                />
              </div>

              <div className="destruction-image-list-card__body">
                <span>IMAGE {String(index + 1).padStart(2, "0")}</span>
                <strong>{tournament.galleryImage?.title ?? tournament.title}</strong>
                <p>클릭하면 이미지 상세 페이지로 이동합니다.</p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
