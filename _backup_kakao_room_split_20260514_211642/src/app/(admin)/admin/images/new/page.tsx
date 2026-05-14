import GalleryImageForm from "@/features/gallery/GalleryImageForm";

export default function AdminNewImagePage() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이미지 등록</h1>
        </div>
      </div>

      <GalleryImageForm
        mode="create"
        submitUrl="/api/images"
        method="POST"
      />
    </div>
  );
}