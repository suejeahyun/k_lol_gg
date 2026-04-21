"use client";

import { FormEvent, useState } from "react";
import KakaoPlayerSearchCard from "@/components/KakaoPlayerSearchCard";

type PlayerSummaryResult = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
};

export default function KakaoPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PlayerSummaryResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch(
        `/api/kakao/web-player-search?query=${encodeURIComponent(query)}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message ?? "검색에 실패했습니다.");
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류입니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kakao-search-page">
      <div className="kakao-search-page__inner">
        <h1 className="kakao-search-page__title">카카오 플레이어 조회</h1>
        <p className="kakao-search-page__desc">
          닉네임#태그 형식으로 입력하면 총판수, 승률, KDA를 조회합니다.
        </p>

        <form className="kakao-search-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 99년생딸피 단단 굵직 묵직#99단굵묵"
            className="kakao-search-form__input"
          />
          <button type="submit" className="kakao-search-form__button" disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </button>
        </form>

        {error ? <p className="kakao-search-page__error">{error}</p> : null}

        {data ? <KakaoPlayerSearchCard data={data} /> : null}
      </div>
    </div>
  );
}