"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mode: "create" | "edit";
  submitUrl: string;
  method: "POST" | "PATCH";
  initialData?: {
    title: string;
    description: string;
    imageUrl: string[];
  };
};

const MAX_IMAGE_COUNT = 5;

export default function GalleryImageForm({
  mode,
  submitUrl,
  method,
  initialData,
}: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setimageUrl] = useState<string[]>(
    initialData?.imageUrl?.length
      ? initialData.imageUrl
      : [""]
  );
  const [submitting, setSubmitting] = useState(false);

  const filledCount = useMemo(
    () => imageUrl.map((url) => url.trim()).filter(Boolean).length,
    [imageUrl]
  );

  const handleChangeImageUrl = (index: number, value: string) => {
    setimageUrl((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const handleAddImageInput = () => {
    if (imageUrl.length >= MAX_IMAGE_COUNT) return;
    setimageUrl((prev) => [...prev, ""]);
  };

  const handleRemoveImageInput = (index: number) => {
    setimageUrl((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedimageUrl = imageUrl
      .map((url) => url.trim())
      .filter(Boolean);

    if (normalizedimageUrl.length === 0) {
      alert("이미지를 최소 1개 이상 입력해주세요.");
      return;
    }

    if (normalizedimageUrl.length > MAX_IMAGE_COUNT) {
      alert("이미지는 최대 5개까지 등록할 수 있습니다.");
      return;
    }

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
          imageUrl: normalizedimageUrl,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.message ?? "저장 중 오류가 발생했습니다.");
        return;
      }

      router.push("/admin/images");
      router.refresh();
    } catch (error) {
      console.error("[GALLERY_IMAGE_FORM_SUBMIT_ERROR]", error);
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
          placeholder="제목을 입력해주세요"
          required
        />
      </div>

      <div className="admin-form__group">
        <label className="admin-form__label">설명</label>
        <textarea
          className="admin-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명을 입력해주세요"
          rows={6}
          required
        />
      </div>

      <div className="admin-form__group">
        <div className="admin-form__label-row">
          <label className="admin-form__label">이미지 URL</label>
          <span className="admin-form__helper">
            {filledCount} / 5
          </span>
        </div>

        <div className="gallery-image-input-list">
          {imageUrl.map((url, index) => (
            <div key={index} className="gallery-image-input-row">
              <input
                type="text"
                className="admin-form__input"
                value={url}
                onChange={(e) => handleChangeImageUrl(index, e.target.value)}
                placeholder={`이미지 URL ${index + 1}`}
              />

              <button
                type="button"
                className="chip-button"
                onClick={() => handleRemoveImageInput(index)}
                disabled={imageUrl.length === 1}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        {imageUrl.length < MAX_IMAGE_COUNT && (
          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleAddImageInput}
          >
            이미지 입력칸 추가
          </button>
        )}
      </div>

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