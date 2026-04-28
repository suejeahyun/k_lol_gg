import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type EventNoticeDetailPageProps = {
  params: Promise<{
    eventNoticeId: string;
  }>;
};

const typeLabels = {
  EVENT_MATCH: "이벤트 내전",
  DESTRUCTION: "멸망전",
  ETC: "기타 이벤트",
} as const;

function formatDate(date: Date | null) {
  if (!date) return "일정 미정";

  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ParagraphText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <p key={index}>{line || "\u00A0"}</p>
      ))}
    </>
  );
}

export default async function EventNoticeDetailPage({
  params,
}: EventNoticeDetailPageProps) {
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
    
    <main className="page-container">
      <article className="notice-detail">
        <div className="notice-detail__header">
          <div className="notice-detail__badges">
            {notice.isPinned ? <span>상단 고정</span> : null}
            <span>{typeLabels[notice.type]}</span>
            <span>{formatDate(notice.startDate)}</span>
          </div>

          <h1>{notice.title}</h1>

          <div className="notice-detail__meta">
            등록일 {formatDate(notice.createdAt)}
          </div>
        </div>

        <section className="notice-detail__section">
          <h2>이벤트 안내</h2>
          <div className="notice-detail__content">
            <ParagraphText text={notice.content} />
          </div>
        </section>

        {notice.recruitInfo ? (
          <section className="notice-detail__section">
            <h2>참가 방법</h2>
            <div className="notice-detail__content">
              <ParagraphText text={notice.recruitInfo} />
            </div>
          </section>
        ) : null}

        {notice.rule ? (
          <section className="notice-detail__section">
            <h2>이벤트 규칙</h2>
            <div className="notice-detail__content">
              <ParagraphText text={notice.rule} />
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}