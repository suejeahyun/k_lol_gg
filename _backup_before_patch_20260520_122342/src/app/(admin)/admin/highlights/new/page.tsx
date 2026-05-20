import HighlightForm from "@/features/highlight/HighlightForm";

export default function AdminNewHighlightPage() {
  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">하이라이트 등록</h1>
          <p className="admin-page__description">
            YouTube URL로 사이트 하이라이트 영상을 등록합니다.
          </p>
        </div>
      </div>

      <HighlightForm mode="create" submitUrl="/api/highlights" method="POST" />
    </main>
  );
}
