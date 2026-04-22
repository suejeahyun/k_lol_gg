import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import NoticeForm from "@/features/notice/NoticeForm";

type AdminNoticeEditPageProps = {
  params: Promise<{
    noticeId: string;
  }>;
};

export default async function AdminNoticeEditPage({
  params,
}: AdminNoticeEditPageProps) {
  const { noticeId } = await params;
  const id = Number(noticeId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const notice = await prisma.notice.findUnique({
    where: { id },
  });

  if (!notice) {
    notFound();
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">공지 수정</h1>
          <p className="admin-page__description">
            기존 공지사항 내용을 수정합니다.
          </p>
        </div>
      </div>

      <NoticeForm
        mode="edit"
        submitUrl={`/api/notices/${notice.id}`}
        initialData={{
          title: notice.title,
          content: notice.content,
          isPinned: notice.isPinned,
        }}
      />
    </div>
  );
}