"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EventMode = "POSITION" | "ARAM";

type EventStatus =
  | "PLANNED"
  | "RECRUITING"
  | "TEAM_BUILDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export default function AdminEventMatchNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<EventMode>("POSITION");
  const [status, setStatus] = useState<EventStatus>("PLANNED");
  const [eventDate, setEventDate] = useState("");
  const [recruitFrom, setRecruitFrom] = useState("");
  const [recruitTo, setRecruitTo] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (!title.trim()) {
      setError("이벤트명을 입력해주세요.");
      return;
    }

    if (!eventDate) {
      setError("진행일을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/event-matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          mode,
          status,
          eventDate,
          recruitFrom: recruitFrom || null,
          recruitTo: recruitTo || null,
          participants: [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "이벤트 내전 생성 실패");
        return;
      }

      router.push(`/admin/progress/event/${data.id}`);
      router.refresh();
    } catch {
      setError("이벤트 내전 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이벤트 내전 생성</h1>
          <p className="admin-page__description">
            이벤트 기본 정보를 먼저 생성합니다. 참가자와 팀 구성은 상세 페이지에서 진행합니다.
          </p>
        </div>
      </div>

      <div className="admin-form">
        <div className="admin-form__group">
          <label className="admin-form__label">이벤트명</label>
          <input
            className="admin-form__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 2026년 5월 이벤트 내전"
          />
        </div>

        <div className="admin-form__group">
          <label className="admin-form__label">설명</label>
          <textarea
            className="admin-form__textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="이벤트 설명을 입력하세요."
          />
        </div>

        <div className="admin-event-form-grid">
          <div className="admin-form__group">
            <label className="admin-form__label">진행 방식</label>
            <select
              className="admin-form__input"
              value={mode}
              onChange={(event) => setMode(event.target.value as EventMode)}
            >
              <option value="POSITION">포지션 지정</option>
              <option value="ARAM">칼바람 / 포지션 없음</option>
            </select>
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">진행 상태</label>
            <select
              className="admin-form__input"
              value={status}
              onChange={(event) => setStatus(event.target.value as EventStatus)}
            >
              <option value="PLANNED">기획중</option>
              <option value="RECRUITING">모집중</option>
              <option value="TEAM_BUILDING">팀 구성중</option>
              <option value="IN_PROGRESS">진행중</option>
              <option value="COMPLETED">종료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">진행일</label>
            <input
              className="admin-form__input"
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
            />
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">모집 시작일</label>
            <input
              className="admin-form__input"
              type="date"
              value={recruitFrom}
              onChange={(event) => setRecruitFrom(event.target.value)}
            />
          </div>

          <div className="admin-form__group">
            <label className="admin-form__label">모집 종료일</label>
            <input
              className="admin-form__input"
              type="date"
              value={recruitTo}
              onChange={(event) => setRecruitTo(event.target.value)}
            />
          </div>
        </div>

        {error ? <p className="notice-form__error">{error}</p> : null}

        <div className="admin-form__actions">
          <button
            type="button"
            className="chip-button"
            onClick={() => router.push("/admin/progress/event")}
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