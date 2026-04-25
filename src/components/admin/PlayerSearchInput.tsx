"use client";

import { useRef, useState } from "react";

type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier?: string | null;
  peakTier?: string | null;
};

type Props = {
  value: string;
  onChange: (player: PlayerOption | null, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function PlayerSearchInput({
  value,
  onChange,
  disabled,
  placeholder = "이름 또는 닉네임 검색",
}: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions] = useState<PlayerOption[]>([]);
  const [searching, setSearching] = useState(false);

  const searchPlayers = async (keyword: string) => {
    const q = keyword.trim();

    if (!q) {
      setSuggestions([]);
      return;
    }

    setSearching(true);

    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });

      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } finally {
      setSearching(false);
    }
  };

  const handleInputChange = (text: string) => {
    onChange(null, text);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      searchPlayers(text);
    }, 250);
  };

  const handleSelect = (player: PlayerOption) => {
    const label = `${player.name} (${player.nickname}#${player.tag})`;
    onChange(player, label);
    setSuggestions([]);
  };

  return (
    <div className="player-search-input">
      <input
        className="admin-form__input"
        value={value}
        onChange={(event) => handleInputChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />

      {searching ? <div className="player-search-input__hint">검색 중...</div> : null}

      {suggestions.length > 0 ? (
        <div className="player-search-input__list">
          {suggestions.map((player) => (
            <button
              key={player.id}
              type="button"
              className="player-search-input__item"
              onClick={() => handleSelect(player)}
            >
              <strong>{player.name}</strong>
              <span>
                {player.nickname}#{player.tag}
              </span>
              <em>
                현재 {player.currentTier ?? "-"} / 최고 {player.peakTier ?? "-"}
              </em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}