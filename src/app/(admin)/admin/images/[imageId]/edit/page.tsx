import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import GalleryImageForm from "@/features/gallery/GalleryImageForm";

type AdminImageEditPageProps = {
  params: Promise<{
    imageId: string;
  }>;
};

export default async function AdminImageEditPage({
  params,
}: AdminImageEditPageProps) {
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
          <p className="admin-page__description">
            기존 이미지 게시물을 수정합니다.
          </p>
        </div>
      </div>

      <GalleryImageForm
        mode="edit"
        submitUrl={`/api/images/${image.id}`}
        initialData={{
          title: image.title,
          description: image.description,
          imageUrl: image.imageUrl,
        }}
      />
    </div>
  );
}