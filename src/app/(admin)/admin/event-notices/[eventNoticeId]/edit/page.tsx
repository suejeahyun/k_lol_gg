import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import EventNoticeForm from "@/features/eventNotice/EventNoticeForm";

type AdminEventNoticeEditPageProps = {
  params: Promise<{
    eventNoticeId: string;
  }>;
};

function toDateTimeLocalValue(date: Date | null) {
  if (!date) return "";

  const pad = (value: number) => String(value).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default async function AdminEventNoticeEditPage({
  params,
}: AdminEventNoticeEditPageProps) {
  const { eventNoticeId } = await params;
  const id = Number(eventNoticeId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const notice = await prisma.eventNotice.findUnique({
    where: { id },
  });

  if (!notice) {
    notFound();
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이벤트 공지 수정</h1>
          <p className="admin-page__description">
            등록된 이벤트 공지 내용을 수정합니다.
          </p>
        </div>
      </div>

      <EventNoticeForm
        mode="edit"
        submitUrl={`/api/event-notices/${notice.id}`}
        method="PATCH"
        initialValues={{
          title: notice.title,
          content: notice.content,
          type: notice.type,
          recruitInfo: notice.recruitInfo ?? "",
          rule: notice.rule ?? "",
          startDate: toDateTimeLocalValue(notice.startDate),
          isPinned: notice.isPinned,
        }}
      />
    </div>
  );
}