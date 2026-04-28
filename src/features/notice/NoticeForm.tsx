"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type NoticeFormProps = {
  mode: "create" | "edit";
  submitUrl: string;
  initialData?: {
    title: string;
    content: string;
    isPinned: boolean;
  };
};

export default function NoticeForm({
  mode,
  submitUrl,
  initialData,
}: NoticeFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [isPinned, setIsPinned] = useState(initialData?.isPinned ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(submitUrl, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          isPinned,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(result?.message ?? "공지사항 저장 실패");
        return;
      }

      router.push("/admin/notices");
      router.refresh();
    } catch (error) {
      console.error("[NOTICE_FORM_SUBMIT_ERROR]", error);
      setErrorMessage("서버 오류 발생");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
<form className="event-notice-form" onSubmit={handleSubmit}>
  <div className="event-notice-form__grid">

    {/* 제목 */}
    <div className="event-notice-form__field event-notice-form__field--full">
      <label className="event-notice-form__label">
        공지 제목 <span className="event-notice-form__required">*</span>
      </label>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
        placeholder="공지 제목 입력"
      />

      <div className="event-notice-form__count">
        {title.length} / 100
      </div>
    </div>

    {/* 내용 */}
    <div className="event-notice-form__field event-notice-form__field--full">
      <label className="event-notice-form__label">
        공지 내용 <span className="event-notice-form__required">*</span>
      </label>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        placeholder="공지 내용을 입력하세요"
      />

      <div className="notice-preview">
        <div className="notice-preview__content">
          {content || "내용 미리보기 영역"}
        </div>
        <div className="notice-preview__overlay">미리보기</div>
      </div>

      <div className="event-notice-form__count">
        {content.length}자
      </div>
    </div>

    {/* 상단 고정 */}
    <div className="event-notice-form__pin">
      <div>
        <div className="event-notice-form__pin-title">상단 고정</div>
        <div className="event-notice-form__pin-desc">
          공지사항을 목록 상단에 고정합니다.
        </div>
      </div>

      <input
        type="checkbox"
        checked={isPinned}
        onChange={(e) => setIsPinned(e.target.checked)}
      />
    </div>

  </div>

  {/* 에러 */}
  {errorMessage && (
    <p className="event-notice-form__error">{errorMessage}</p>
  )}

  {/* 버튼 */}
  <div className="event-notice-form__actions">
    <button
      type="button"
      className="event-notice-form__button event-notice-form__button--secondary"
      onClick={() => router.push("/admin/notices")}
      disabled={isSubmitting}
    >
      취소
    </button>

    <button
      type="submit"
      className="event-notice-form__button event-notice-form__button--primary"
      disabled={isSubmitting || !title || !content}
    >
      {isSubmitting
        ? mode === "create"
          ? "등록 중..."
          : "수정 중..."
        : mode === "create"
        ? "공지 등록"
        : "공지 수정"}
    </button>
  </div>
</form>
  );
}