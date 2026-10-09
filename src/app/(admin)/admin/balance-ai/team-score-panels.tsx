"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw, Search } from "@/components/theme/theme-icons";
import { withTeamBalancePlayerOverride } from "@/modules/team-tools/domain/team-balance";
import { competitionPositionLabel } from "@/modules/competitions/core/display-projection";
import type { TeamScoreOverview as OverviewData, TeamScorePlayerDetail } from "@/modules/team-tools/application/team-score-query";
import type { BoundedPickerOption } from "../matches/bounded-picker";
import { isUsableTeamScoreResponse } from "./team-score-response";
import styles from "./team-balance-override.module.css";

type ReadResult<T> = { key: string; data: T | null; error: string | null };
const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const valueText = (value: number | null) => value === null ? "-" : numberFormat.format(value);
const overrideText = (value: number) => `${value > 0 ? "+" : ""}${valueText(value)}점`;

function useTeamScoreQuery<T extends OverviewData | TeamScorePlayerDetail>(query: string, kind: T["kind"], refreshRevision: number) {
  const [result, setResult] = useState<ReadResult<T> | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${query}:${refreshRevision}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/admin/balance-ai/team-scores?${query}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "점수 자료를 불러오지 못했습니다.");
        if (!isUsableTeamScoreResponse(body, kind, new URLSearchParams(query).get("playerId"))) throw new Error("점수 자료 응답을 확인하지 못했습니다.");
        if (!controller.signal.aborted) setResult({ key, data: body as T, error: null });
      } catch (cause) {
        if (!controller.signal.aborted) setResult({ key, data: null, error: cause instanceof Error ? cause.message : "점수 자료를 불러오지 못했습니다." });
      }
    })();
    return () => controller.abort();
  }, [query, kind, key]);
  return {
    data: result?.data ?? null,
    error: result?.key === key ? result.error : null,
    loading: result?.key !== key,
    retry: () => setRetry((value) => value + 1),
  };
}

function ReadState({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  return <div className={styles.readState}>
    <p role={error ? "alert" : "status"}>{loading ? "점수 자료를 불러오는 중…" : error}</p>
    {error ? <button type="button" onClick={retry}><RefreshCw size={16} />다시 불러오기</button> : null}
  </div>;
}

function PageButtons({ page, total, pageSize, label, onPage, disabled = false }: {
  page: number; total: number; pageSize: number; label: string; onPage: (page: number) => void; disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && page <= 1) return null;
  return <nav className={styles.pageControls} aria-label={label}>
    <button type="button" disabled={disabled || page <= 1} aria-label={`${label} 이전`} title="이전 페이지" onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button>
    <span>{page} / {pages}</span>
    <button type="button" disabled={disabled || page >= pages} aria-label={`${label} 다음`} title="다음 페이지" onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button>
  </nav>;
}

export function TeamScoreDetails({ playerId, currentScore, currentRevision, draftScore, refreshRevision, reloadDisabled, onReload }: {
  playerId: string; currentScore: number; currentRevision: number; draftScore: number | null; refreshRevision: number; reloadDisabled: boolean; onReload: () => void;
}) {
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ playerId, page: String(page), pageSize: "10" }).toString();
  const read = useTeamScoreQuery<TeamScorePlayerDetail>(query, "player", refreshRevision);
  if (read.data && !read.loading && read.data.override.revision !== currentRevision) return <section className={styles.overviewSection} aria-labelledby="team-score-stale-title">
    <h3 id="team-score-stale-title">현재 점수가 변경되었습니다</h3>
    <p className={styles.basis} role="status">다른 변경이 확인되어 점수 비교와 이력을 갱신해야 합니다. 입력한 점수와 사유는 유지됩니다.</p>
    <button className={styles.simpleButton} type="button" disabled={reloadDisabled} onClick={onReload}><RefreshCw size={16} />최신 점수 확인</button>
  </section>;
  const matchingData = read.data?.override.revision === currentRevision ? read.data : null;
  const current = matchingData ? withTeamBalancePlayerOverride(matchingData.breakdown, currentScore) : null;
  const preview = matchingData && draftScore !== null ? withTeamBalancePlayerOverride(matchingData.breakdown, draftScore) : null;
  return <div className={styles.details} aria-busy={read.loading}>
    <section aria-labelledby="team-score-breakdown-title">
      <header className={styles.subheader}><h3 id="team-score-breakdown-title">포지션별 예상 팀 편성 점수</h3><span>주포지션 기준</span></header>
      {read.loading || read.error ? <ReadState {...read} /> : null}
      {current && matchingData ? <>
        <dl className={styles.scoreSummary}>
          <div><dt>기준 점수</dt><dd>{valueText(current.baseScore)}점</dd></div>
          <div><dt>현재 보정</dt><dd>{overrideText(currentScore)}</dd></div>
          <div><dt>입력한 보정</dt><dd>{draftScore === null ? "-" : overrideText(draftScore)}</dd></div>
        </dl>
        <p className={styles.basis}>현재 티어 {matchingData.player.currentTier ?? "미등록"} · 최고 티어 {matchingData.player.peakTier ?? "미등록"}</p>
        <div className={styles.tableScroll} role="region" aria-label="포지션별 점수 비교" tabIndex={0}>
          <table className={styles.positionTable}><thead><tr><th scope="col">포지션</th><th scope="col">현재</th><th scope="col">저장 후 예상</th></tr></thead>
            <tbody>{current.positions.map((position, index) => <tr key={position.position}><th scope="row">{competitionPositionLabel(position.position)}</th><td>{valueText(position.effectiveScore)}</td><td><strong>{preview ? valueText(preview.positions[index].effectiveScore) : "-"}</strong></td></tr>)}</tbody>
          </table>
        </div>
        <p className={styles.basis}>각 포지션을 주포지션으로 가정한 점수입니다. 실제 편성에서는 선택한 선호 포지션에 따라 달라집니다.</p>
      </> : null}
    </section>
    <section aria-labelledby="team-score-history-title">
      <header className={styles.subheader}><h3 id="team-score-history-title">보정 변경 이력</h3>{matchingData ? <span>총 {matchingData.history.total.toLocaleString("ko-KR")}건</span> : null}</header>
      {matchingData ? matchingData.history.items.length ? <>
        <ol className={styles.history}>
          {matchingData.history.items.map((item) => <li key={item.id}>
            <div className={styles.historyTop}><strong>{item.actorLabel}</strong><time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time></div>
            <div className={styles.historyChange}><span>{item.beforeScore === null ? "미설정 0점" : overrideText(item.beforeScore)}</span><ArrowRight size={15} /><strong>{overrideText(item.afterScore)}</strong></div>
            <p>{item.reason}</p>
          </li>)}
        </ol>
        <PageButtons page={matchingData.history.page} total={matchingData.history.total} pageSize={matchingData.history.pageSize} label="보정 변경 이력 페이지" onPage={setPage} disabled={read.loading} />
      </> : <p className={styles.readState} role="status">{page > 1 ? "현재 페이지에 변경 이력이 없습니다." : "저장된 보정 변경 이력이 없습니다."}{page > 1 ? <button type="button" onClick={() => setPage(1)}>첫 페이지로</button> : null}</p> : <p className={styles.basis}>{read.loading ? "변경 이력 확인 중…" : "점수 자료를 다시 불러오면 이력을 확인할 수 있습니다."}</p>}
    </section>
  </div>;
}

export function TeamScoreOverview({ refreshRevision, selectedPlayerId, disabled, onSelect }: {
  refreshRevision: number; selectedPlayerId: string; disabled: boolean; onSelect: (option: BoundedPickerOption) => void;
}) {
  const [view, setView] = useState<"players" | "tiers">("players");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const panelId = useId();
  const read = useTeamScoreQuery<OverviewData>(new URLSearchParams({ page: String(page), pageSize: "10", q: query }).toString(), "overview", refreshRevision);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1); setQuery(search.trim());
  }
  function changeView(next: "players" | "tiers", focus = false) {
    setView(next);
    if (focus) document.getElementById(`${panelId}-${next}`)?.focus();
  }
  return <section className={styles.overviewSection} aria-label="팀 편성 점수 참고 자료">
    <div className={styles.referenceTabs} role="tablist" aria-label="점수 참고 자료">
      {(["players", "tiers"] as const).map((tab) => <button key={tab} id={`${panelId}-${tab}`} type="button" role="tab" aria-selected={view === tab} aria-controls={`${panelId}-panel`} tabIndex={view === tab ? 0 : -1} onClick={() => changeView(tab)} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          changeView(event.key === "Home" ? "players" : event.key === "End" ? "tiers" : view === "players" ? "tiers" : "players", true);
        }
      }}>{tab === "players" ? "보정 관리 목록" : "티어별 기준 점수"}</button>)}
    </div>
    <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${view}`} aria-busy={read.loading}>
      {view === "players" ? <>
        <header className={styles.subheader}><h3 id="team-score-overview-title">보정 관리 목록</h3>{read.data ? <span>{read.data.configured.total.toLocaleString("ko-KR")}명</span> : null}</header>
        <form className={styles.listFilter} onSubmit={filter}>
          <label htmlFor={`${panelId}-search`}>플레이어 검색</label>
          <div><input id={`${panelId}-search`} type="search" value={search} maxLength={100} placeholder="닉네임 또는 Riot ID" onChange={(event) => setSearch(event.target.value)} /><button type="submit" aria-label="보정 관리 목록 검색" title="검색"><Search size={18} /></button></div>
          {query ? <button type="button" onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>검색 초기화</button> : null}
        </form>
        {read.loading || read.error ? <ReadState {...read} /> : null}
        {read.data ? <>
          {read.data.configured.items.length ? <ul className={styles.playerList}>{read.data.configured.items.map((player) => <li key={player.playerId}>
            <button type="button" disabled={disabled || read.loading} aria-pressed={selectedPlayerId === player.playerId} onClick={() => onSelect({ value: player.playerId, label: player.riotId || player.displayName, status: "ACTIVE" })}>
              <span className={styles.playerIdentity}><strong>{player.displayName}</strong><small>{player.riotId} · {player.currentTier ?? "티어 미등록"}</small></span>
              <span className={styles.playerScores}><small>기준 {valueText(player.baseScore)}점</small><strong>{player.score === 0 ? "보정 해제" : overrideText(player.score)}</strong></span>
              <ChevronRight size={18} />
            </button>
          </li>)}</ul> : <p className={styles.readState} role="status">{page > 1 ? "현재 페이지에 플레이어가 없습니다." : query ? "검색 조건에 맞는 플레이어가 없습니다." : "보정 설정 이력이 있는 활성 플레이어가 없습니다."}</p>}
          <p className={styles.basis}>활성 플레이어의 보정 설정 내역 · 0점으로 해제한 플레이어 포함</p>
          {page > 1 && read.data.configured.items.length === 0 ? <button className={styles.simpleButton} type="button" onClick={() => setPage(1)}>첫 페이지로</button> : null}
          <PageButtons page={read.data.configured.page} total={read.data.configured.total} pageSize={read.data.configured.pageSize} label="보정 관리 목록 페이지" onPage={setPage} disabled={read.loading} />
        </> : null}
      </> : <>
        <header className={styles.subheader}><h3 id="team-score-tiers-title">티어별 기준 점수</h3></header>
        {read.loading || read.error ? <ReadState {...read} /> : null}
        {read.data ? <>
          <p className={styles.basis}>활성 플레이어 {read.data.activePlayerCount.toLocaleString("ko-KR")}명 · 현재 티어 기준 · 수동 보정 제외</p>
          <div className={styles.tableScroll} role="region" aria-label="현재 티어별 기준 점수 통계" tabIndex={0}>
            <table className={styles.tierTable}><thead><tr><th scope="col">티어</th><th scope="col">인원</th><th scope="col">평균</th><th scope="col">중앙값</th></tr></thead><tbody>
              {read.data.tiers.map((tier) => <tr key={tier.tier}><th scope="row">{tier.tierLabel}</th><td>{tier.playerCount.toLocaleString("ko-KR")}</td><td>{valueText(tier.averageBaseScore)}</td><td>{valueText(tier.medianBaseScore)}</td></tr>)}
            </tbody></table>
          </div>
          {read.data.activePlayerCount === 0 ? <p className={styles.readState} role="status">집계할 활성 플레이어가 없습니다.</p> : null}
        </> : null}
      </>}
    </div>
  </section>;
}
