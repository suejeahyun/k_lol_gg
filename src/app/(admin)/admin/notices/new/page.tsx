import NoticeForm from "@/features/notice/NoticeForm";

export default function AdminNoticeNewPage() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">공지사항 등록</h1>
          <p className="admin-page__description">
            사용자에게 노출할 공지사항을 새로 등록합니다.
          </p>
        </div>
      </div>

      <NoticeForm mode="create" />
    </div>
  );
}