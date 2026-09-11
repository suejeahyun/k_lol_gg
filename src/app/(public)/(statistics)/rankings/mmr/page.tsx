import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Gauge, Search, Sparkles } from "lucide-react";

import { MMR_POSITIONS, parseMmrPlayerQuery } from "@/modules/mmr";
import { loadRuntimeMmr } from "@/modules/mmr/infrastructure/runtime-mmr";

import styles from "./mmr.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MMR 랭킹",
  description: "공개 경기 전체를 순서대로 재생해 계산한 플레이어·포지션 MMR입니다.",
  alternates: { canonical: "/rankings/mmr" },
};

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

  return (
    <div className={`page-wrap ${styles.page}`} data-mmr-view="players">
      <section className={styles.hero}>
        <div><span><Sparkles aria-hidden="true" /> DETERMINISTIC MMR</span><h1>실력의 흐름을 한눈에</h1><p>공개된 모든 경기를 같은 순서와 공식으로 다시 계산해요. 표본이 적을수록 신뢰도를 함께 확인해 주세요.</p></div>
        <Gauge aria-hidden="true" />
      </section>
      <nav className={styles.tabs} aria-label="랭킹 종류"><Link href="/rankings">시즌 랭킹</Link><Link href="/rankings/mmr" aria-current="page">MMR 랭킹</Link></nav>
      <form className={styles.filters} action="/rankings/mmr" method="get">
        <label>플레이어 검색<input name="q" defaultValue={query?.query ?? ""} maxLength={64} placeholder="닉네임 또는 태그" /></label>
        <label>기준 포지션<select name="position" defaultValue={query?.position ?? ""}><option value="">종합</option>{MMR_POSITIONS.map((position) => <option value={position} key={position}>{labels[position]}</option>)}</select></label>
        <button type="submit"><Search aria-hidden="true" /> 찾기</button>
      </form>
      {result.state === "ready" ? (
        <>
          <section className={styles.summary} aria-label="MMR 집계 상태">
            <article><span>집계 차수</span><strong>{result.data.summary.generation}</strong></article>
            <article><span>공개 경기</span><strong>{result.data.summary.sourceMatchCount}</strong></article>
            <article><span>반영 대기</span><strong>{result.data.summary.pendingSourceCount}</strong></article>
          </section>
          {result.data.summary.formulaTransition === "ADMIN_RECALCULATION_REQUIRED" ? <section className={styles.state} role="status" data-mmr-formula-transition="ADMIN_RECALCULATION_REQUIRED"><h2>현재 게시 MMR generation을 표시하고 있어요</h2><p>이 generation은 {result.data.summary.formulaVersion ?? "기존"} 공식으로 계산됐습니다. V2_DETERMINISTIC_1로 자동 전환하지 않으며, 관리자 재계산이 승인된 뒤에만 새 generation이 게시됩니다.</p></section> : null}
          {result.data.summary.status === "EMPTY" || result.data.players.items.length === 0 ? (
            <section className={styles.state} role="status"><Activity aria-hidden="true" /><h2>표시할 MMR이 아직 없어요</h2><p>공개 경기 반영이 끝나면 이곳에 안전한 요약만 표시됩니다.</p></section>
          ) : (
            <section className={styles.board} aria-labelledby="mmr-board-title">
              <header><h2 id="mmr-board-title">플레이어 MMR</h2><p>{result.data.players.total}명 · 신뢰도와 표본 포함</p></header>
              <ol>{result.data.players.items.map((player, index) => <li key={player.playerId}><b>{(result.data.players.page - 1) * result.data.players.pageSize + index + 1}</b><Link href={`/players/${player.playerId}`}><strong>{player.displayName}</strong><small>{player.riotId}</small></Link><span><small>MMR</small>{player.overallScore.toFixed(2)}</span><span><small>신뢰도</small>{Math.round(player.confidence * 100)}%</span><span><small>표본</small>{player.sampleSize}</span></li>)}</ol>
            </section>
          )}
        </>
      ) : (
        <section className={styles.state} role={result.state === "invalid" || result.state === "error" ? "alert" : "status"}><Activity aria-hidden="true" /><h2>{result.state === "invalid" ? "검색 조건을 확인해 주세요" : "MMR을 불러올 수 없어요"}</h2><p>허용된 검색 조건으로 잠시 후 다시 시도해 주세요.</p></section>
      )}
    </div>
  );
}
