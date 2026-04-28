import EventNoticeForm from "@/features/eventNotice/EventNoticeForm";

export default function AdminEventNoticeNewPage() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이벤트 공지 등록</h1>
          <p className="admin-page__description">
            어떤 이벤트를 진행하는지 유저에게 공지합니다.
          </p>
        </div>
      </div>

      <EventNoticeForm
        mode="create"
        submitUrl="/api/event-notices"
        method="POST"
      />
    </div>
  );
}