import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, CloudSun, FilePlus2, Gamepad2, Search } from "lucide-react";

import { parsePublicMatchQuery } from "@/modules/matches/infrastructure/match-query";
import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";

import styles from "./matches.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "경기 결과",
  description: "K-LOL.GG 내전 경기 결과와 게임별 공개 스코어보드를 확인합니다.",
  alternates: { canonical: "/matches" },
};

function urlFromSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return `http://local/matches?${params}`;
}

function nextHref(query: NonNullable<ReturnType<typeof parsePublicMatchQuery>>, cursor: string) {
  const params = new URLSearchParams();
  if (query.query) params.set("q", query.query);
  if (query.seasonId) params.set("seasonId", query.seasonId);
  if (query.winner) params.set("winner", query.winner);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  params.set("sort", query.sort);
  params.set("order", query.order);
  params.set("pageSize", String(query.pageSize));
  params.set("cursor", cursor);
  return `/matches?${params}`;
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parsePublicMatchQuery(urlFromSearchParams(raw));
  const [result, seasonResult] = await Promise.all([
    query
      ? loadRuntimeMatchData((service) => service.listPublic(query))
      : Promise.resolve({ state: "error" as const }),
    loadRuntimeSeasonData((service) => service.listPublicSeasons()),
  ]);

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="matches-title">
        <div>
          <p>MATCH ARCHIVE</p>
          <h1 id="matches-title">우리의 내전 기록</h1>
          <span>게임별 승패와 MVP, 공개 플레이어 기록을 한눈에 확인해요.</span>
          <div className={styles.heroActions}>
            <Link href="/matches/submit"><FilePlus2 size={17} aria-hidden="true" /> 결과 접수</Link>
            <Link href="/players"><Search size={17} aria-hidden="true" /> 플레이어 찾기</Link>
          </div>
        </div>
        <Gamepad2 aria-hidden="true" />
      </section>

      <form className={styles.filters} action="/matches" method="get" role="search">
        <label className={styles.filterWide}>경기 이름<input name="q" maxLength={100} defaultValue={query?.query ?? ""} placeholder="내전 이름 검색" /></label>
        <label>시즌<select name="seasonId" defaultValue={query?.seasonId ?? ""}><option value="">전체 시즌</option>{seasonResult.state === "ready" ? seasonResult.data.map((season) => <option key={season.id} value={season.id}>{season.name}</option>) : null}</select></label>
        <label>시리즈 결과<select name="winner" defaultValue={query?.winner ?? ""}><option value="">전체</option><option value="BLUE">블루 승리</option><option value="RED">레드 승리</option><option value="TIE">무승부</option></select></label>
        <label>시작일<input name="from" type="date" defaultValue={query?.from ?? ""} /></label>
        <label>종료일<input name="to" type="date" defaultValue={query?.to ?? ""} /></label>
        <label>정렬 기준<select name="sort" defaultValue={query?.sort ?? "playedOn"}><option value="playedOn">경기 날짜</option><option value="title">경기 이름</option></select></label>
        <label>정렬 방향<select name="order" defaultValue={query?.order ?? "desc"}><option value="desc">최신/내림차순</option><option value="asc">오래된/오름차순</option></select></label>
        <input type="hidden" name="pageSize" value={query?.pageSize ?? 12} />
        <button type="submit">찾아보기</button>
      </form>

      <section aria-labelledby="match-list-title">
        <div className={styles.heading}>
          <div><span>RESULTS</span><h2 id="match-list-title">경기 결과</h2></div>
          <strong>{result.state === "ready" ? `${result.data.total}개` : "—"}</strong>
        </div>
      </section>

      {result.state === "unavailable" ? (
        <section className={styles.state} role="status"><CloudSun /><h2>경기 데이터 연결을 준비하고 있어요.</h2><p>샘플 결과를 대신 보여주지 않습니다.</p></section>
      ) : result.state === "error" ? (
        <section className={styles.state} role="alert"><Search /><h2>경기 결과를 불러오지 못했어요.</h2><p>검색 조건을 확인하거나 잠시 후 다시 시도해 주세요.</p></section>
      ) : result.data.items.length === 0 ? (
        <section className={styles.state}><Gamepad2 /><h2>조건에 맞는 공개 경기가 없어요.</h2><p>첫 경기가 공개되면 이곳에 표시됩니다.</p></section>
      ) : (
        <>
          <div className={styles.grid}>
            {result.data.items.map((match) => (
              <Link className={styles.card} href={`/matches/${match.id}`} key={match.id}>
                <div className={styles.cardTop}><span>{match.season.name}</span><ChevronRight size={18} aria-hidden="true" /></div>
                <h3>{match.title}</h3>
                <div className={styles.score}><span>BLUE</span><strong>{match.blueWins}</strong><b>:</b><strong>{match.redWins}</strong><span>RED</span></div>
                <div className={styles.meta}><span><CalendarDays size={14} aria-hidden="true" /> {match.playedOn}</span><span>{match.gameCount}게임</span></div>
              </Link>
            ))}
          </div>
          {result.data.nextCursor && query ? (
            <nav className={styles.pager} aria-label="경기 결과 더 보기"><Link href={nextHref(query, result.data.nextCursor)}>다음 결과 보기 <ChevronRight size={16} aria-hidden="true" /></Link></nav>
          ) : null}
        </>
      )}
    </div>
  );
}
