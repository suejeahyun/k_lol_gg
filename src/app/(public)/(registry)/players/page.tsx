import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Sparkles, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  parsePlayerCatalogQuery,
  playerTierFilters,
  playerTierLabel,
  PlayerResultCard,
} from "@/modules/players";
import type { PlayerTierFilter } from "@/modules/players/domain/player-tier";
import { loadRuntimePlayerCatalog } from "@/modules/players/infrastructure/runtime-player-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "플레이어 찾기",
  description: "회원명, 공개 닉네임과 Riot ID로 K-LOL.GG 플레이어를 검색합니다.",
  alternates: { canonical: "/players" },
};

function playersHref(query: string, tier: PlayerTierFilter | null, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tier) params.set("tier", tier);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/players?${suffix}` : "/players";
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const catalogQuery = parsePlayerCatalogQuery(await searchParams);
  const result = await loadRuntimePlayerCatalog(catalogQuery);

  return (
    <div className="page-wrap players-page">
      <Link className="back-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> 홈으로</Link>

      <section className="players-hero" aria-labelledby="players-title">
        <div>
          <Badge variant="secondary"><Sparkles size={13} aria-hidden="true" /> K-LOL · PLAYER REGISTRY</Badge>
          <p>PLAYER REGISTRY</p>
          <h1 id="players-title">플레이어 찾기</h1>
          <span>회원명·닉네임·Riot ID로 찾고, 원하는 티어만 모아볼 수 있어요.</span>
        </div>
        <UsersRound size={86} aria-hidden="true" />
      </section>

      <form className="player-search-form" action="/players" method="get" role="search">
        <label htmlFor="player-search">회원명·닉네임 또는 Riot ID</label>
        <div>
          <Search size={19} aria-hidden="true" />
          <Input
            id="player-search"
            name="q"
            type="search"
            maxLength={80}
            defaultValue={catalogQuery.query}
            placeholder="회원명, GameName 또는 GameName#TAG"
            autoComplete="off"
          />
          <Button size="lg" type="submit">검색</Button>
        </div>
        {catalogQuery.tier ? <input type="hidden" name="tier" value={catalogQuery.tier} /> : null}
        <small>회원명은 정확히 입력해 주세요. 검색 결과에는 공개 닉네임과 Riot ID만 표시합니다.</small>
        <nav className="player-tier-filters" aria-label="티어별 플레이어 필터">
          <Link
            href={playersHref(catalogQuery.query, null, 1)}
            aria-current={catalogQuery.tier === null ? "page" : undefined}
          >
            전체
          </Link>
          {playerTierFilters.map((tier) => (
            <Link
              key={tier.value}
              data-tier={tier.value}
              href={playersHref(catalogQuery.query, tier.value, 1)}
              aria-current={catalogQuery.tier === tier.value ? "page" : undefined}
            >
              {tier.label}
            </Link>
          ))}
        </nav>
      </form>

      <section className="player-results" aria-live="polite" aria-labelledby="results-title">
        <div className="player-results__heading">
          <div>
            <p>SEARCH RESULT</p>
            <h2 id="results-title">
              {catalogQuery.query
                ? `“${catalogQuery.query}”${catalogQuery.tier ? ` · ${playerTierLabel(catalogQuery.tier)}` : ""} 검색 결과`
                : catalogQuery.tier
                  ? `${playerTierLabel(catalogQuery.tier)} 플레이어`
                  : "전체 플레이어"}
            </h2>
          </div>
          <span>{result.state === "ready" ? `${result.data.totalCount}명` : "—"}</span>
        </div>

        {result.state === "unavailable" ? (
          <div className="empty-state" role="status">
            <Search size={28} aria-hidden="true" />
            <strong>플레이어 등록부를 불러올 수 없어요.</strong>
            <p>잠시 후 다시 검색해 주세요.</p>
          </div>
        ) : result.state === "error" ? (
          <div className="empty-state empty-state--error" role="alert">
            <Search size={28} aria-hidden="true" />
            <strong>플레이어 정보를 불러오지 못했어요.</strong>
            <p>잠시 후 다시 검색해 주세요. 입력한 검색어는 주소에 남아 있어 다시 입력하지 않아도 됩니다.</p>
          </div>
        ) : result.data.items.length === 0 ? (
          <div className="empty-state">
            <Search size={28} aria-hidden="true" />
            <strong>{catalogQuery.query || catalogQuery.tier ? "조건에 맞는 플레이어가 없어요." : "등록된 활성 플레이어가 없어요."}</strong>
            <p>{catalogQuery.query || catalogQuery.tier ? "검색어를 확인하거나 다른 티어를 선택해 보세요." : "플레이어가 등록되면 이곳에 공개 목록이 표시됩니다."}</p>
            {catalogQuery.query || catalogQuery.tier ? <Link className="empty-state__link" href="/players">검색 초기화</Link> : null}
          </div>
        ) : (
          <>
            <div className="player-grid">
              {result.data.items.map((player) => <PlayerResultCard key={player.id} player={player} />)}
            </div>
            {result.data.totalPages > 1 ? (
              <nav className="pagination" aria-label="플레이어 검색 결과 페이지">
                {result.data.currentPage > 1 ? (
                  <Link href={playersHref(catalogQuery.query, catalogQuery.tier, result.data.currentPage - 1)} rel="prev">
                    <ChevronLeft size={17} aria-hidden="true" /> 이전
                  </Link>
                ) : <span aria-disabled="true"><ChevronLeft size={17} aria-hidden="true" /> 이전</span>}
                <strong aria-current="page">{result.data.currentPage} / {result.data.totalPages}</strong>
                {result.data.currentPage < result.data.totalPages ? (
                  <Link href={playersHref(catalogQuery.query, catalogQuery.tier, result.data.currentPage + 1)} rel="next">
                    다음 <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                ) : <span aria-disabled="true">다음 <ChevronRight size={17} aria-hidden="true" /></span>}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
