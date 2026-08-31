import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Search, Sparkles, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPlayers } from "@/modules/players/application/search-players";
import { PlayerResultCard } from "@/modules/players/ui/player-result-card";

export const metadata: Metadata = {
  title: "플레이어 찾기",
  description: "K-LOL.GG V2의 첫 기능 슬라이스인 플레이어 검색 화면입니다.",
};

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const players = await searchPlayers(q);

  return (
    <div className="page-wrap players-page">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} /> 홈으로
      </Link>

      <section className="players-hero">
        <div>
          <Badge variant="secondary">
            <Sparkles size={13} /> FIRST VERTICAL SLICE
          </Badge>
          <p>PLAYER REGISTRY</p>
          <h1>플레이어 찾기</h1>
          <span>
            실제 운영 데이터와 연결하지 않은 합성 데이터로 검색 계약과 화면 상태를 먼저 검증합니다.
          </span>
        </div>
        <UsersRound size={86} aria-hidden="true" />
      </section>

      <form className="player-search-form" action="/players" method="get">
        <label htmlFor="player-search">플레이어 이름 또는 Riot ID</label>
        <div>
          <Search size={19} aria-hidden="true" />
          <Input
            id="player-search"
            name="q"
            defaultValue={q}
            placeholder="예: 하늘여우 또는 SkyFox#V2"
            autoComplete="off"
          />
          <Button size="lg" type="submit">
            검색
          </Button>
        </div>
        <small>개인정보가 포함되지 않은 V2 전용 합성 fixture입니다.</small>
      </form>

      <section className="player-results" aria-live="polite" aria-labelledby="results-title">
        <div className="player-results__heading">
          <div>
            <p>SEARCH RESULT</p>
            <h2 id="results-title">{q ? `“${q}” 검색 결과` : "샘플 플레이어"}</h2>
          </div>
          <span>{players.length}명</span>
        </div>

        {players.length > 0 ? (
          <div className="player-grid">
            {players.map((player) => (
              <PlayerResultCard key={player.id} player={player} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={28} />
            <strong>일치하는 샘플 플레이어가 없어요.</strong>
            <p>“하늘여우”, “라일락별”, “복숭아바람”, “민트구름” 중 하나를 검색해 보세요.</p>
          </div>
        )}
      </section>
    </div>
  );
}
