"use client";

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
  return (
    <form action="/matches" method="get" className="match-search-form">
      <input
        type="text"
        name="q"
        defaultValue={initialQuery}
        placeholder="내전 제목 / 시즌명 검색"
        autoComplete="off"
        className="match-search-form__input"
      />

      <select
        name="seasonId"
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