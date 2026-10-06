import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { Activity, Gauge, Search } from "@/components/theme/theme-icons";

import { MMR_POSITIONS, parseMmrPlayerQuery } from "@/modules/mmr";
import { loadRuntimeMmr } from "@/modules/mmr/infrastructure/runtime-mmr";
import { formatOptionalKoreanDateTime } from "@/platform/time/format-korean-date-time";

import styles from "./mmr.module.css";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/rankings/mmr");

const labels = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;

export default async function MmrRankingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const viewValid = raw.view === undefined || raw.view === "players";
  const url = new URL("https://v2.invalid/rankings/mmr");
  for (const [key, value] of Object.entries(raw)) {
    if (key === "view") continue;
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
    else if (value !== undefined) url.searchParams.set(key, value);
  }
  const query = viewValid ? parseMmrPlayerQuery(url.href) : null;
  const result = query
    ? await loadRuntimeMmr(async (service) => ({
        summary: await service.getSummary(),
        players: await service.listPlayers(query),
      }))
    : { state: "invalid" as const };
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(query?.pageSize ?? 20) });
    if (query?.query) params.set("q", query.query);
    if (query?.position) params.set("position", query.position);
    return `/rankings/mmr?${params}`;
  };
  const positionLabel = query?.position ? labels[query.position] : "종합";
  const pageCount = result.state === "ready" ? Math.min(10_000, result.data.players.totalPages) : 0;

  return (
    <div className={`page-wrap ${styles.page}`} data-mmr-view="players">
      <section className={styles.hero}>
        <div><h1>MMR 순위</h1></div>
        <Gauge aria-hidden="true" />
      </section>
      <nav className={styles.tabs} aria-label="랭킹 종류"><Link href="/rankings">시즌 랭킹</Link><Link href="/rankings/mmr" aria-current="page">MMR 랭킹</Link></nav>
      <form key={`${query?.query ?? ""}:${query?.position ?? ""}:${query?.pageSize ?? 20}`} className={styles.filters} action="/rankings/mmr" method="get">
        <input type="hidden" name="pageSize" value={query?.pageSize ?? 20} />
        <label>플레이어 검색<input name="q" defaultValue={query?.query ?? ""} maxLength={64} placeholder="닉네임 또는 태그" /></label>
        <label>기준 포지션<select name="position" defaultValue={query?.position ?? ""}><option value="">종합</option>{MMR_POSITIONS.map((position) => <option value={position} key={position}>{labels[position]}</option>)}</select></label>
        <button type="submit"><Search aria-hidden="true" /> 찾기</button>
        {query?.query || query?.position || (query?.page ?? 1) > 1 ? <Link href="/rankings/mmr">검색 초기화</Link> : null}
      </form>
      {result.state === "ready" ? (
        <>
          <section className={styles.summary} aria-label="MMR 집계 상태">
            <article><span>집계 차수</span><strong>{result.data.summary.generation}</strong></article>
            <article><span>공개 경기</span><strong>{result.data.summary.sourceMatchCount}</strong></article>
            <article><span>반영 대기</span><strong>{result.data.summary.pendingSourceCount}</strong></article>
          </section>
          <p>마지막 집계: {formatOptionalKoreanDateTime(result.data.summary.calculatedAt)} · 공개된 경기 결과가 반영됩니다.</p>
          {result.data.summary.formulaTransition === "ADMIN_RECALCULATION_REQUIRED" ? <section className={styles.state} role="status" data-mmr-formula-transition="ADMIN_RECALCULATION_REQUIRED"><h2>이전 공식의 MMR 표시 중</h2><p>적용 공식: {result.data.summary.formulaVersion ?? "기존"} · 관리자 재계산 승인 후 갱신</p></section> : null}
          {result.data.summary.status === "EMPTY" ? (
            <section className={styles.state} role="status"><Activity aria-hidden="true" /><h2>표시할 MMR이 아직 없어요</h2></section>
          ) : result.data.players.items.length === 0 ? (
            <section className={styles.state} role="status"><Activity aria-hidden="true" /><h2>{result.data.players.total > 0 ? "현재 페이지에 플레이어가 없어요" : query?.query ? "검색어에 맞는 플레이어가 없어요" : "표시할 플레이어가 없어요"}</h2><p>{result.data.players.total > 0 ? "목록이 변경되었거나 페이지 범위를 벗어났어요. 첫 페이지에서 다시 확인해 주세요." : query?.query ? "닉네임 또는 태그를 확인하거나 검색 조건을 초기화해 보세요." : "공개된 활성 플레이어의 MMR이 준비되면 표시됩니다."}</p>{result.data.players.total > 0 ? <Link href={pageHref(1)}>첫 페이지로</Link> : query?.query || query?.position ? <Link href="/rankings/mmr">검색 초기화</Link> : null}</section>
          ) : (
            <section className={styles.board} aria-labelledby="mmr-board-title">
              <header><h2 id="mmr-board-title">{positionLabel} MMR 순위</h2><p>{result.data.players.total}명</p></header>
              <ol>{result.data.players.items.map((player, index) => { const rank = (result.data.players.page - 1) * result.data.players.pageSize + index + 1; const confidence = player.confidence >= .8 ? "high" : player.confidence >= .5 ? "medium" : "low"; const selectedPosition = query?.position ? player.positions[query.position] : null; return <li key={player.playerId} data-rank={rank} data-confidence={confidence}><b>{rank}</b><Link href={`/players/${player.playerId}`}><strong>{player.displayName}</strong><small>{player.riotId}</small></Link><span><small>{positionLabel} MMR</small>{(selectedPosition?.score ?? player.overallScore).toFixed(2)}</span><span><small>종합 신뢰도</small>{Math.round(player.confidence * 100)}%</span><span><small>{positionLabel} 표본</small>{selectedPosition?.sampleSize ?? player.sampleSize}</span></li>; })}</ol>
            </section>
          )}
          {result.data.summary.status !== "EMPTY" && pageCount > 1 && result.data.players.items.length > 0 ? <nav className="pagination" aria-label="MMR 랭킹 페이지">
            {result.data.players.page > 1 ? <Link href={pageHref(Math.min(result.data.players.page - 1, pageCount))} rel="prev">이전</Link> : <span aria-disabled="true">이전</span>}
            <strong aria-current="page">{result.data.players.page} / {pageCount}</strong>
            {result.data.players.page < pageCount ? <Link href={pageHref(result.data.players.page + 1)} rel="next">다음</Link> : <span aria-disabled="true">다음</span>}
          </nav> : null}
        </>
      ) : (
        <section className={styles.state} role={result.state === "invalid" || result.state === "error" ? "alert" : "status"}><Activity aria-hidden="true" /><h2>{result.state === "invalid" ? "검색 조건을 확인해 주세요" : "MMR을 불러올 수 없어요"}</h2><p>{result.state === "invalid" ? "검색 주소의 조건이 올바르지 않아요. 전체 순위에서 다시 검색해 주세요." : "잠시 후 같은 검색 조건으로 다시 불러와 주세요."}</p>{result.state !== "invalid" ? <a href={pageHref(query?.page ?? 1)}>다시 불러오기</a> : null}<Link href="/rankings/mmr">전체 MMR 순위</Link></section>
      )}
    </div>
  );
}
