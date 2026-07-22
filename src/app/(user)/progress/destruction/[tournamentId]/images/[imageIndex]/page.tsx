export const dynamic = "force-dynamic";

import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    imageIndex: string;
  }>;
};

export default async function DestructionImageDetailPage({ params }: PageProps) {
  const { tournamentId, imageIndex } = await params;
  const id = Number(tournamentId);
  const index = Number(imageIndex);

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(index) || index < 1) {
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

  const images = coerceGalleryImageUrls(tournament.galleryImage?.imageUrl);
  const imageUrl = images[index - 1];

  if (!imageUrl) {
    notFound();
  }

  return (
    <main className="page-container destruction-content-detail-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">DESTRUCTION IMAGE DETAIL</p>
          <h1 className="page-title">{tournament.title} 이미지 {index}</h1>
          <p className="page-description">
            {tournament.galleryImage?.description || "등록된 멸망전 이미지를 상세로 확인합니다."}
          </p>
        </div>

        <div className="page-actions">
          <Link href={`/progress/destruction/${tournament.id}/images`} className="btn btn-ghost">
            이미지 목록으로
          </Link>
          <Link href={`/progress/destruction/${tournament.id}`} className="btn btn-ghost">
            멸망전 상세로
          </Link>
        </div>
      </div>

      <figure className="destruction-image-detail-card">
        <SafeGalleryImage
          src={imageUrl}
          alt={`${tournament.galleryImage?.title ?? tournament.title} ${index}`}
          width={1600}
          height={960}
          className="destruction-image-detail-card__image"
          loading="eager"
        />
        <figcaption>
          {tournament.galleryImage?.title ?? tournament.title} · IMAGE {String(index).padStart(2, "0")}
        </figcaption>
      </figure>
    </main>
  );
}
