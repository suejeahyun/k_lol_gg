"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DestructionStatus =
  | "PLANNED"
  | "RECRUITING"
  | "TEAM_BUILDING"
  | "PRELIMINARY"
  | "TOURNAMENT"
  | "COMPLETED"
  | "CANCELLED";

export default function AdminDestructionTournamentNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<DestructionStatus>("PLANNED");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [galleryImageId, setGalleryImageId] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (!title.trim()) {
      setError("멸망전명을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/destruction-tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          status,
          startDate: startDate || null,
          endDate: endDate || null,
          galleryImageId: galleryImageId ? Number(galleryImageId) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "멸망전 생성 실패");
        return;
      }

      router.push(`/admin/progress/destruction/${data.id}`);
      router.refresh();
    } catch {
      setError("멸망전 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">멸망전 생성</h1>
          <p className="admin-page__description">
            멸망전 기본 정보를 먼저 생성합니다. 팀장과 참가자는 상세 페이지에서 등록합니다.
          </p>
        </div>
      </div>

      <div className="admin-form">
        <div className="admin-form__group">
          <label className="admin-form__label">멸망전명</label>
          <input
            className="admin-form__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 2026 K-LOL 멸망전"
          />
        </div>

        <div className="admin-form__group">
          <label className="admin-form__label">설명</label>
          <textarea
            className="admin-form__textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="멸망전 설명을 입력하세요."
          />
        </div>

        <div className="admin-event-form-grid">
          <div className="admin-form__group">
            <label className="admin-form__label">진행 상태</label>
            <select
              className="admin-form__input"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as DestructionStatus)
              }
            >
              <option value="PLANNED">기획중</option>
              <option value="RECRUITING">모집중</option>
              <option value="TEAM_BUILDING">팀 구성중</option>
              <option value="PRELIMINARY">예선 진행</option>
              <option value="TOURNAMENT">토너먼트 진행</option>
              <option value="COMPLETED">종료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">시작일</label>
            <input
              className="admin-form__input"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">종료일</label>
            <input
              className="admin-form__input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">갤러리 이미지 ID</label>
            <input
              className="admin-form__input"
              value={galleryImageId}
              onChange={(event) => setGalleryImageId(event.target.value)}
              placeholder="선택 사항"
              inputMode="numeric"
            />
          </div>
        </div>

        {error ? <p className="notice-form__error">{error}</p> : null}

        <div className="admin-form__actions">
          <button
            type="button"
            className="chip-button"
            onClick={() => router.push("/admin/progress/destruction")}
          >
            목록으로
          </button>

          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "생성 중..." : "생성하기"}
          </button>
        </div>
      </div>
    </main>
  );
}