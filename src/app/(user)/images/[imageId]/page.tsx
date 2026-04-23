import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import ImageSlider from "@/components/ImageSlider";

type ImageDetailPageProps = {
  params: Promise<{
    imageId: string;
  }>;
};

export default async function ImageDetailPage({
  params,
}: ImageDetailPageProps) {
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

  const imageList = Array.isArray(image.imageUrl) ? image.imageUrl : [];

  return (
    <div className="gallery-detail">
      <div className="gallery-detail__header">
        <h1 className="gallery-detail__title">{image.title}</h1>

        <div className="gallery-detail__meta">
          {new Date(image.createdAt).toLocaleDateString("ko-KR")}
        </div>
      </div>

      <div className="gallery-detail__image-wrap">
        {imageList.length > 0 ? (
          <ImageSlider images={imageList} title={image.title} />
        ) : (
          <div className="gallery-detail__image-empty">
            등록된 이미지가 없습니다.
          </div>
        )}
      </div>

      <div className="gallery-detail__content">
        {image.description.split("\n").map((line, index) => (
          <p key={`${image.id}-${index}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}