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
    <form className="notice-form" onSubmit={handleSubmit}>
      {/* 제목 */}
      <div className="notice-form__group">
        <label className="notice-form__label">제목</label>
        <input
          type="text"
          className="notice-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="공지 제목 입력"
          required
        />
        <div className="notice-form__count">{title.length} / 100</div>
      </div>

      {/* 내용 */}
      <div className="notice-form__group">
        <label className="notice-form__label">내용</label>

        <textarea
          className="notice-form__textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="공지 내용을 입력하세요"
          rows={10}
          required
        />

        {/* 미리보기 + 덮개 */}
        <div className="notice-preview">
          <div className="notice-preview__content">
            {content || "내용 미리보기 영역"}
          </div>

          <div className="notice-preview__overlay">
            미리보기
          </div>
        </div>

        <div className="notice-form__count">{content.length}자</div>
      </div>

      {/* 고정 */}
      <label className="notice-form__checkbox">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
        />
        상단 고정
      </label>

      {/* 에러 */}
      {errorMessage && (
        <p className="notice-form__error">{errorMessage}</p>
      )}

      {/* 버튼 */}
      <div className="notice-form__actions">
        <button
          type="button"
          className="notice-form__secondary-button"
          onClick={() => router.push("/admin/notices")}
          disabled={isSubmitting}
        >
          취소
        </button>

        <button
          type="submit"
          className="notice-form__submit-button"
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