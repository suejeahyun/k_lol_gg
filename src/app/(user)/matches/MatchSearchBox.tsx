"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type MatchSearchBoxProps = {
  initialQuery: string;
  seasons: Array<{
    id: number;
    name: string;
    isActive: boolean;
  }>;
  selectedSeasonId?: number;
};

export default function MatchSearchBox({
  initialQuery,
  seasons,
  selectedSeasonId,
}: MatchSearchBoxProps) {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("q") ?? "").trim();
    const seasonId = String(formData.get("seasonId") ?? "").trim();
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (seasonId) params.set("seasonId", seasonId);

    const queryString = params.toString();
    router.push(queryString ? `/matches?${queryString}` : "/matches");
  }

  return (
    <form
      action="/matches"
      method="get"
      className="match-search-form"
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        name="q"
        aria-label="내전 제목 또는 시즌명 검색"
        defaultValue={initialQuery}
        placeholder="내전 제목 / 시즌명 검색"
        autoComplete="off"
        className="match-search-form__input"
      />

      <select
        name="seasonId"
        aria-label="시즌 선택"
        defaultValue={selectedSeasonId ? String(selectedSeasonId) : ""}
        className="match-search-form__select"
      >
        <option value="">전체 시즌</option>
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.isActive ? "현재 · " : ""}
            {season.name}
          </option>
        ))}
      </select>

      <button type="submit" className="match-search-form__button">
        검색
      </button>
    </form>
  );
}
