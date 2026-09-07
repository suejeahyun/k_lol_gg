import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Sparkles, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePlayerCatalogQuery, PlayerResultCard } from "@/modules/players";
import { loadRuntimePlayerCatalog } from "@/modules/players/infrastructure/runtime-player-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "플레이어 찾기",
  description: "공개 닉네임과 Riot ID로 K-LOL.GG 플레이어를 검색합니다.",
  alternates: { canonical: "/players" },
};

function playersHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
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
          <span>활성 플레이어의 공개 표시명, Riot ID, 허용된 티어 정보만 보여줍니다.</span>
        </div>
        <UsersRound size={86} aria-hidden="true" />
      </section>

      <form className="player-search-form" action="/players" method="get" role="search">
        <label htmlFor="player-search">플레이어 닉네임 또는 Riot ID</label>
        <div>
          <Search size={19} aria-hidden="true" />
          <Input
            id="player-search"
            name="q"
            type="search"
            maxLength={80}
            defaultValue={catalogQuery.query}
            placeholder="GameName 또는 GameName#TAG"
            autoComplete="off"
          />
          <Button size="lg" type="submit">검색</Button>
        </div>
        <small>검색어는 80자까지 허용하며 계정 아이디·회원명·Discord 식별자는 검색 대상이 아니며 결과에도 표시하지 않습니다.</small>
      </form>

      <section className="player-results" aria-live="polite" aria-labelledby="results-title">
        <div className="player-results__heading">
          <div>
            <p>SEARCH RESULT</p>
            <h2 id="results-title">
              {catalogQuery.query ? `“${catalogQuery.query}” 검색 결과` : "전체 플레이어"}
            </h2>
          </div>
          <span>{result.state === "ready" ? `${result.data.totalCount}명` : "—"}</span>
        </div>

        {result.state === "unavailable" ? (
          <div className="empty-state" role="status">
            <Search size={28} aria-hidden="true" />
            <strong>플레이어 등록부를 불러올 수 없어요.</strong>
            <p>잠시 후 다시 검색해 주세요. 확인되지 않은 플레이어는 임의로 표시하지 않습니다.</p>
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
            <strong>{catalogQuery.query ? "일치하는 플레이어가 없어요." : "등록된 활성 플레이어가 없어요."}</strong>
            <p>{catalogQuery.query ? "닉네임 철자와 #태그를 확인하거나 검색어를 줄여 보세요." : "플레이어가 등록되면 이곳에 공개 목록이 표시됩니다."}</p>
            {catalogQuery.query ? <Link className="empty-state__link" href="/players">검색 초기화</Link> : null}
          </div>
        ) : (
          <>
            <div className="player-grid">
              {result.data.items.map((player) => <PlayerResultCard key={player.id} player={player} />)}
            </div>
            {result.data.totalPages > 1 ? (
              <nav className="pagination" aria-label="플레이어 검색 결과 페이지">
                {result.data.currentPage > 1 ? (
                  <Link href={playersHref(catalogQuery.query, result.data.currentPage - 1)} rel="prev">
                    <ChevronLeft size={17} aria-hidden="true" /> 이전
                  </Link>
                ) : <span aria-disabled="true"><ChevronLeft size={17} aria-hidden="true" /> 이전</span>}
                <strong aria-current="page">{result.data.currentPage} / {result.data.totalPages}</strong>
                {result.data.currentPage < result.data.totalPages ? (
                  <Link href={playersHref(catalogQuery.query, result.data.currentPage + 1)} rel="next">
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
