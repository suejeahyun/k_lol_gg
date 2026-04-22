"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type GalleryImageFormProps = {
  mode: "create" | "edit";
  submitUrl: string;
  initialData?: {
    title: string;
    description: string;
    imageUrl: string;
  };
};

export default function GalleryImageForm({
  mode,
  submitUrl,
  initialData,
}: GalleryImageFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const previewUrl = useMemo(() => {
    const trimmed = imageUrl.trim();

    if (!trimmed) {
      return "";
    }

    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return "";
    }
  }, [imageUrl]);

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
          description,
          imageUrl,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(result?.message ?? "이미지 저장에 실패했습니다.");
        return;
      }

      router.push("/admin/images");
      router.refresh();
    } catch (error) {
      console.error("[GALLERY_IMAGE_FORM_SUBMIT_ERROR]", error);
      setErrorMessage("이미지 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="gallery-form" onSubmit={handleSubmit}>
      <div className="gallery-form__group">
        <label htmlFor="title" className="gallery-form__label">
          제목
        </label>
        <input
          id="title"
          type="text"
          className="gallery-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="이미지 제목을 입력하세요."
          maxLength={100}
          required
        />
      </div>

      <div className="gallery-form__group">
        <label htmlFor="description" className="gallery-form__label">
          설명
        </label>
        <textarea
          id="description"
          className="gallery-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이미지 설명을 입력하세요."
          rows={8}
          required
        />
      </div>

      <div className="gallery-form__group">
        <label htmlFor="imageUrl" className="gallery-form__label">
          이미지 URL
        </label>
        <input
          id="imageUrl"
          type="text"
          className="gallery-form__input"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/image.png"
          required
        />
      </div>

      <div className="gallery-form__preview-block">
        <div className="gallery-form__preview-title">이미지 미리보기</div>

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="이미지 미리보기"
            className="gallery-form__preview-image"
          />
        ) : (
          <div className="gallery-form__preview-empty">
            미리볼 이미지가 없습니다.
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="gallery-form__error">{errorMessage}</p>
      ) : null}

      <div className="gallery-form__actions">
        <button
          type="button"
          className="gallery-form__secondary-button"
          onClick={() => router.push("/admin/images")}
          disabled={isSubmitting}
        >
          취소
        </button>

        <button
          type="submit"
          className="gallery-form__submit-button"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? mode === "create"
              ? "등록 중..."
              : "수정 중..."
            : mode === "create"
            ? "이미지 등록"
            : "이미지 수정"}
        </button>
      </div>
    </form>
  );
}