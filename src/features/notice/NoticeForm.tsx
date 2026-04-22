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
        setErrorMessage(result?.message ?? "공지사항 저장에 실패했습니다.");
        return;
      }

      router.push("/admin/notices");
      router.refresh();
    } catch (error) {
      console.error("[NOTICE_FORM_SUBMIT_ERROR]", error);
      setErrorMessage("공지사항 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="notice-form" onSubmit={handleSubmit}>
      <div className="notice-form__group">
        <label htmlFor="title" className="notice-form__label">
          제목
        </label>
        <input
          id="title"
          type="text"
          className="notice-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목을 입력하세요."
          maxLength={100}
          required
        />
      </div>

      <div className="notice-form__group">
        <label htmlFor="content" className="notice-form__label">
          내용
        </label>
        <textarea
          id="content"
          className="notice-form__textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="공지 내용을 입력하세요."
          rows={12}
          required
        />
      </div>

      <label className="notice-form__checkbox">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
        />
        <span>상단 고정</span>
      </label>

      {errorMessage ? (
        <p className="notice-form__error">{errorMessage}</p>
      ) : null}

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
          disabled={isSubmitting}
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