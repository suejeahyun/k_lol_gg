"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildDestructionWinnerImageUrls,
  getDestructionWinnerImageCount,
  normalizeGalleryImageUrls,
} from "@/lib/gallery/winner-image-paths";

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
const LARGE_IMAGE_WARNING_TEXT = "신규 우승 이미지는 Google Drive 공유 링크 사용을 권장합니다. 로컬 public 경로는 배경/아이콘처럼 공통 UI에 필요한 정적 자산에만 사용하세요.";

export default function GalleryImageForm({
  mode,
  submitUrl,
  method,
  initialData,
}: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string[]>(
    initialData?.imageUrl?.length ? initialData.imageUrl : [""]
  );
  const [destructionRound, setDestructionRound] = useState("");
  const [destructionImageCount, setDestructionImageCount] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const filledCount = useMemo(
    () => imageUrl.map((url) => url.trim()).filter(Boolean).length,
    [imageUrl]
  );

  const handleChangeImageUrl = (index: number, value: string) => {
    setImageUrl((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const handleAddImageInput = () => {
    if (imageUrl.length >= MAX_IMAGE_COUNT) return;
    setImageUrl((prev) => [...prev, ""]);
  };

  const handleRemoveImageInput = (index: number) => {
    setImageUrl((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const handleFillDestructionPaths = () => {
    const round = Number(destructionRound);

    if (!Number.isInteger(round) || round <= 0) {
      alert("멸망전 회차를 숫자로 입력해주세요.");
      return;
    }

    const fallbackCount = getDestructionWinnerImageCount(round);
    const selectedCount = Number(destructionImageCount);
    const imageCount = Number.isInteger(selectedCount)
      ? selectedCount
      : fallbackCount;

    setImageUrl(buildDestructionWinnerImageUrls(round, imageCount));
  };

  const handleRoundChange = (value: string) => {
    setDestructionRound(value);

    const round = Number(value);
    if (Number.isInteger(round) && round > 0) {
      setDestructionImageCount(String(getDestructionWinnerImageCount(round)));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedImageUrl = normalizeGalleryImageUrls(imageUrl);

    if (normalizedImageUrl.length === 0) {
      alert("이미지를 최소 1개 이상 입력해주세요.");
      return;
    }

    if (normalizedImageUrl.length > MAX_IMAGE_COUNT) {
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
          imageUrl: normalizedImageUrl,
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
        <input aria-label="예: 제 6회 멸망전 우승"
          type="text"
          className="admin-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 제 6회 멸망전 우승"
          required
        />
      </div>

      <div className="admin-form__group">
        <label className="admin-form__label">설명</label>
        <textarea aria-label="설명을 입력해주세요"
          className="admin-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명을 입력해주세요"
          rows={6}
          required
        />
      </div>

      <div className="admin-form__group gallery-local-path-box">
        <div className="admin-form__label-row">
          <label className="admin-form__label">이미지 경로 / Google Drive 링크 입력</label>
          <span className="admin-form__helper">Drive 권장 · 로컬 경로 보조</span>
        </div>

        <div className="gallery-local-path-box__row">
          <input aria-label="회차 예: 5"
            type="number"
            min={1}
            className="admin-form__input"
            value={destructionRound}
            onChange={(e) => handleRoundChange(e.target.value)}
            placeholder="회차 예: 5"
          />

          <select
            className="admin-form__input"
            value={destructionImageCount}
            onChange={(e) => setDestructionImageCount(e.target.value)}
            aria-label="이미지 개수"
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}장
              </option>
            ))}
          </select>

          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleFillDestructionPaths}
          >
            경로 자동 입력
          </button>
        </div>

        <p className="gallery-local-path-box__help">
          기존 public 이미지를 계속 사용할 때만 자동 입력을 사용하세요.
          신규 이미지는 Google Drive 파일 공유 링크를 입력하면 저장 시
          <code>https://drive.google.com/thumbnail?id=...&amp;sz=w1600</code> 형식으로 자동 변환됩니다.
        </p>
      </div>

      <div className="admin-form__group">
        <div className="admin-form__label-row">
          <label className="admin-form__label">이미지 경로</label>
          <span className="admin-form__helper">{filledCount} / 5</span>
        </div>

        <p className="gallery-local-path-box__help gallery-local-path-box__help--warning">
          {LARGE_IMAGE_WARNING_TEXT}
        </p>

        <div className="gallery-image-input-list">
          {imageUrl.map((url, index) => (
            <div key={index} className="gallery-image-input-row">
              <input aria-label="Google Drive 공유 링크 또는 /images/... 경로"
                type="text"
                className="admin-form__input"
                value={url}
                onChange={(e) => handleChangeImageUrl(index, e.target.value)}
                placeholder="Google Drive 공유 링크 또는 /images/... 경로"
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
