import GalleryImageForm from "@/features/gallery/GalleryImageForm";

export default function AdminImageCreatePage() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이미지 등록</h1>
          <p className="admin-page__description">
            새로운 이미지 게시물을 등록합니다.
          </p>
        </div>
      </div>

      <GalleryImageForm mode="create" submitUrl="/api/images" />
    </div>
  );
}