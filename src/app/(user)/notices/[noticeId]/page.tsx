import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type NoticeDetailPageProps = {
  params: Promise<{
    noticeId: string;
  }>;
};

export default async function NoticeDetailPage({
  params,
}: NoticeDetailPageProps) {
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
    <div className="notice-detail">
      <div className="notice-detail__header">
        {notice.isPinned ? (
          <span className="notice-detail__badge">상단 고정 공지</span>
        ) : null}

        <h1 className="notice-detail__title">{notice.title}</h1>

        <div className="notice-detail__meta">
          {new Date(notice.createdAt).toLocaleDateString("ko-KR")}
        </div>
      </div>

      <div className="notice-detail__content">
        {notice.content.split("\n").map((line, index) => (
          <p key={`${notice.id}-${index}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}