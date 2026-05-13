"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mode: "create" | "edit";
  submitUrl: string;
  method: "POST" | "PATCH";
  initialData?: {
    title: string;
    description: string;
    youtubeUrl: string;
    thumbnailUrl: string | null;
    isPublished: boolean;
    sortOrder: number;
  };
};

export default function HighlightForm({
  mode,
  submitUrl,
  method,
  initialData,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(initialData?.youtubeUrl ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initialData?.thumbnailUrl ?? "");
  const [isPublished, setIsPublished] = useState(initialData?.isPublished ?? true);
  const [sortOrder, setSortOrder] = useState(String(initialData?.sortOrder ?? 0));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setSubmitting(true);

      const res = await fetch(submitUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          youtubeUrl,
          thumbnailUrl,
          isPublished,
          sortOrder,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.message ?? "저장 중 오류가 발생했습니다.");
        return;
      }

      router.push("/admin/highlights");
      router.refresh();
    } catch (error) {
      console.error("[HIGHLIGHT_FORM_SUBMIT_ERROR]", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-form">
      <div className="admin-form__group">
        <label className="admin-form__label">제목</label>
        <input
          type="text"
          className="admin-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="하이라이트 제목"
          required
        />
      </div>

      <div className="admin-form__group">
        <label className="admin-form__label">YouTube URL</label>
        <input
          type="text"
          className="admin-form__input"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          required
        />
        <p className="admin-form__helper">
          watch, youtu.be, shorts, embed, live 형식을 지원합니다. 저장 시 표준 watch URL과 YouTube ID로 자동 정리됩니다.
        </p>
      </div>

      <div className="admin-form__group">
        <label className="admin-form__label">썸네일 URL</label>
        <input
          type="text"
          className="admin-form__input"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="비워두면 YouTube 기본 썸네일 자동 사용 / Drive 공유 링크도 가능"
        />
      </div>

      <div className="admin-form__group">
        <label className="admin-form__label">설명</label>
        <textarea
          className="admin-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="하이라이트 설명"
          rows={6}
          required
        />
      </div>

      <div className="admin-form__group">
        <label className="admin-form__label">정렬 순서</label>
        <input
          type="number"
          className="admin-form__input"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="0"
        />
      </div>

      <label className="highlight-form-check">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
        />
        <span>유저 페이지에 공개</span>
      </label>

      <div className="admin-form__actions">
        <button
          type="submit"
          className="admin-page__create-button"
          disabled={submitting}
        >
          {submitting
            ? mode === "create"
              ? "등록 중..."
              : "수정 중..."
            : mode === "create"
            ? "등록"
            : "수정"}
        </button>
      </div>
    </form>
  );
}
