"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EventNoticeType } from "@prisma/client";

type EventNoticeFormProps = {
  mode: "create" | "edit";
  submitUrl: string;
  method?: "POST" | "PATCH";
  initialValues?: {
    title: string;
    content: string;
    type: EventNoticeType;
    recruitInfo: string;
    rule: string;
    startDate: string;
    isPinned: boolean;
  };
};

const typeLabels: Record<EventNoticeType, string> = {
  EVENT_MATCH: "이벤트 내전",
  DESTRUCTION: "멸망전",
  ETC: "기타 이벤트",
};

export default function EventNoticeForm({
  mode,
  submitUrl,
  method = mode === "create" ? "POST" : "PATCH",
  initialValues,
}: EventNoticeFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [type, setType] = useState<EventNoticeType>(
    initialValues?.type ?? "EVENT_MATCH"
  );
  const [recruitInfo, setRecruitInfo] = useState(
    initialValues?.recruitInfo ?? ""
  );
  const [rule, setRule] = useState(initialValues?.rule ?? "");
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "");
  const [isPinned, setIsPinned] = useState(initialValues?.isPinned ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    const res = await fetch(submitUrl, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        type,
        recruitInfo,
        rule,
        startDate: startDate || null,
        isPinned,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      alert(data?.message ?? "저장 실패");
      setIsSubmitting(false);
      return;
    }

    router.push("/admin/event-notices");
    router.refresh();
  }

  return (
    <form className="event-notice-form" onSubmit={handleSubmit}>
      <div className="event-notice-form__grid">

        {/* 제목 */}
        <div className="event-notice-form__field event-notice-form__field--full">
          <label className="event-notice-form__label">
            이벤트 제목 <span className="event-notice-form__required">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 5월 이벤트 내전 참가 안내"
          />
        </div>

        {/* 이벤트 종류 */}
        <div className="event-notice-form__field">
          <label className="event-notice-form__label">
            이벤트 종류 <span className="event-notice-form__required">*</span>
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventNoticeType)}
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* 날짜 */}
        <div className="event-notice-form__field">
          <label className="event-notice-form__label">이벤트 일시</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {/* 설명 */}
        <div className="event-notice-form__field event-notice-form__field--full">
          <label className="event-notice-form__label">
            이벤트 설명 <span className="event-notice-form__required">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="어떤 이벤트인지 설명하세요."
          />
        </div>

        {/* 참가 방법 */}
        <div className="event-notice-form__field">
          <label className="event-notice-form__label">참가 방법</label>
          <textarea
            value={recruitInfo}
            onChange={(e) => setRecruitInfo(e.target.value)}
            placeholder="예: 디스코드 댓글 신청 / 오픈채팅 신청"
          />
        </div>

        {/* 규칙 */}
        <div className="event-notice-form__field">
          <label className="event-notice-form__label">이벤트 규칙</label>
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder="예: 단판제, 3판 2선승"
          />
        </div>

        {/* 상단 고정 */}
        <div className="event-notice-form__pin">
          <div>
            <div className="event-notice-form__pin-title">상단 고정</div>
            <div className="event-notice-form__pin-desc">
              이벤트 공지를 목록 상단에 고정합니다.
            </div>
          </div>

          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
        </div>

      </div>

      {/* 버튼 */}
      <div className="event-notice-form__actions">
        <button
          type="button"
          className="event-notice-form__button event-notice-form__button--secondary"
          onClick={() => router.back()}
        >
          취소
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="event-notice-form__button event-notice-form__button--primary"
        >
          {isSubmitting ? "저장 중..." : "등록하기"}
        </button>
      </div>
    </form>
  );
}