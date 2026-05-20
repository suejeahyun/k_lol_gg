"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Team = {
  id: number;
  name: string;
};

type Participant = {
  id: number;
  playerId: number;
  player: {
    nickname: string;
    tag: string;
  };
};

type GalleryImage = {
  id: number;
  title: string;
};

type Props = {
  tournamentId: number;
  teams: Team[];
  participants: Participant[];
  galleryImages: GalleryImage[];
  initialWinnerTeamId: number | null;
  initialMvpPlayerId: number | null;
  initialGalleryImageId: number | null;
};

export default function DestructionCompleteForm({
  tournamentId,
  teams,
  participants,
  galleryImages,
  initialWinnerTeamId,
  initialMvpPlayerId,
  initialGalleryImageId,
}: Props) {
  const router = useRouter();

  const [winnerTeamId, setWinnerTeamId] = useState(
    initialWinnerTeamId ? String(initialWinnerTeamId) : ""
  );
  const [mvpPlayerId, setMvpPlayerId] = useState(
    initialMvpPlayerId ? String(initialMvpPlayerId) : ""
  );
  const [galleryImageId, setGalleryImageId] = useState(
    initialGalleryImageId ? String(initialGalleryImageId) : ""
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (!winnerTeamId) {
      setError("우승 팀을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/complete`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            winnerTeamId: Number(winnerTeamId),
            mvpPlayerId: mvpPlayerId ? Number(mvpPlayerId) : null,
            galleryImageId: galleryImageId ? Number(galleryImageId) : null,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "최종 결과 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("최종 결과 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="destruction-complete-form">
      <div className="destruction-complete-form__grid">
        <select
          className="admin-form__input"
          value={winnerTeamId}
          onChange={(event) => setWinnerTeamId(event.target.value)}
        >
          <option value="">우승 팀 선택</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <select
          className="admin-form__input"
          value={mvpPlayerId}
          onChange={(event) => setMvpPlayerId(event.target.value)}
        >
          <option value="">MVP 선택 없음</option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.playerId}>
              {participant.player.nickname}#{participant.player.tag}
            </option>
          ))}
        </select>

        <select
          className="admin-form__input"
          value={galleryImageId}
          onChange={(event) => setGalleryImageId(event.target.value)}
        >
          <option value="">갤러리 이미지 선택 없음</option>
          {galleryImages.map((galleryImage) => (
            <option key={galleryImage.id} value={galleryImage.id}>
              {galleryImage.title}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "저장 중..." : "멸망전 종료 처리"}
        </button>
      </div>

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}