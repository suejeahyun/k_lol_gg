"use client";

import { useEffect, useState } from "react";

type PlayerSearchBoxProps = {
  initialQuery: string;
};

export default function PlayerSearchBox({
  initialQuery,
}: PlayerSearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  return (
    <div className="player-search-box">
      <form action="/players" method="get" className="player-search-form">
        <input
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 닉네임#태그 검색"
          className="player-search-input"
          autoComplete="off"
        />

        <button type="submit" className="player-search-button">
          검색
        </button>
      </form>
    </div>
  );
}