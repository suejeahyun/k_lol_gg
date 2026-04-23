import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import GalleryImageForm from "@/features/gallery/GalleryImageForm";

type PageProps = {
  params: Promise<{
    imageId: string;
  }>;
};

export default async function AdminEditImagePage({ params }: PageProps) {
  const { imageId } = await params;
  const id = Number(imageId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const image = await prisma.galleryImage.findUnique({
    where: { id },
  });

  if (!image) {
    notFound();
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이미지 수정</h1>
        </div>
      </div>

      <GalleryImageForm
        mode="edit"
        submitUrl={`/api/images/${image.id}`}
        method="PATCH"
        initialData={{
          title: image.title,
          description: image.description,
          imageUrls: image.imageUrl,
        }}
      />
    </div>
  );
}