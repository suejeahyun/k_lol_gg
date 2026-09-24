"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Share2, Star } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PublicRiotSummaryDto } from "@/modules/riot/domain/riot-integration";
import type { RiotPlayerAnalyticsDto } from "@/modules/riot/domain/riot-player-analytics";
import { formatOptionalKoreanDateTime } from "@/platform/time/format-korean-date-time";
import { aggregatePlayerMatches, DEFAULT_PLAYER_MATCH_FILTERS, filterPlayerMatches, koreanMatchDate, matchPatch, PLAYER_POSITION_LABELS, playerBuildAggregates, playerChampionAggregates, playerEncounters, playerPositionAggregates, playerReportMetrics, queueLabel, selfParticipant, type PlayerMatchFilters } from "./player-analytics";
import { PlayerHistoryChart } from "./player-history-chart";
import { PlayerReportHistory } from "./player-report-history";
import { PlayerBuildInsights } from "./player-build-insights";
import { PlayerAsset, PlayerChampion, PlayerMatchDetail } from "./player-match-detail";
import styles from "./player-riot-profile.module.css";

function subscribeFavorites(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("klol-player-favorites-changed", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("klol-player-favorites-changed", listener); };
}

function Filters({ filters, onChange, analytics }: Readonly<{ filters: PlayerMatchFilters; onChange: (value: PlayerMatchFilters) => void; analytics: RiotPlayerAnalyticsDto }>) {
  const update = (key: keyof PlayerMatchFilters, value: string) => onChange({ ...filters, [key]: value });
  const years = [...new Set(analytics.matches.map((match) => koreanMatchDate(match.startedAt).slice(0, 4)))].sort().reverse();
  const patches = [...new Set(analytics.matches.map(matchPatch))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const queues = [...new Set(analytics.matches.map((match) => match.queueId))].sort();
  const champions = playerChampionAggregates(analytics.matches);
  return <fieldset className={styles.filters}><legend>경기 분석 필터</legend>
    <label>연도<select value={filters.year} onChange={(event) => update("year", event.target.value)}><option value="ALL">수집된 모든 연도</option>{years.map((year) => <option key={year} value={year}>{year}년</option>)}</select></label>
    <label>게임 종류<select value={filters.queue} onChange={(event) => update("queue", event.target.value)}><option value="ALL">전체 게임</option>{queues.map((id) => <option key={id} value={id}>{queueLabel(id)}</option>)}</select></label>
    <div className={styles.patchFilter}><span>패치 (복수 선택)</span><details><summary>{filters.patch === "ALL" ? "모든 패치" : `${filters.patch.split(",").length}개 선택`}</summary><fieldset className={styles.patchChoices}><legend>분석할 패치</legend><label><input type="checkbox" checked={filters.patch === "ALL"} onChange={() => update("patch", "ALL")} />모든 패치</label>{patches.map((patch) => <label key={patch}><input type="checkbox" checked={filters.patch !== "ALL" && filters.patch.split(",").includes(patch)} onChange={(event) => { const values = new Set(filters.patch === "ALL" ? [] : filters.patch.split(",")); if (event.target.checked) values.add(patch); else values.delete(patch); update("patch", values.size ? [...values].sort().join(",") : "ALL"); }} />{patch}</label>)}</fieldset></details></div>
    <label>포지션<select value={filters.position} onChange={(event) => update("position", event.target.value)}><option value="ALL">모든 포지션</option>{Object.entries(PLAYER_POSITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>챔피언<select value={filters.champion} onChange={(event) => update("champion", event.target.value)}><option value="ALL">모든 챔피언</option>{champions.map((champion) => <option key={champion.championId} value={champion.championId}>{champion.championName}</option>)}</select></label>
    <label>결과<select value={filters.result} onChange={(event) => update("result", event.target.value)}><option value="ALL">모든 결과</option><option value="win">승리</option><option value="loss">패배</option><option value="remake">다시하기</option></select></label>
    <label>시작일<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update("from", event.target.value)} /></label><label>종료일<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} /></label>
    <label>경기 정렬<select value={filters.sort} onChange={(event) => update("sort", event.target.value)}><option value="recent">최신순</option><option value="oldest">오래된순</option><option value="kda">KDA 높은순</option><option value="damage">피해량 높은순</option></select></label>
    <Button type="button" variant="outline" onClick={() => onChange(DEFAULT_PLAYER_MATCH_FILTERS)}>필터 초기화</Button>
  </fieldset>;
}

function ChampionTable({ rows, onSelect, limit }: Readonly<{ rows: ReturnType<typeof playerChampionAggregates>; onSelect: (id: number) => void; limit?: number }>) {
  const columns = [{ key: "games", label: "게임 수" }, { key: "winRate", label: "승률" }, { key: "kda", label: "KDA" }, { key: "csPerMinute", label: "CS / 분" }, { key: "damagePerMinute", label: "피해량 / 분" }, { key: "averageGold", label: "평균 골드" }, { key: "averageTurretPlates", label: "포탑 방패" }, { key: "killParticipation", label: "킬 관여율" }, { key: "averageVisionScore", label: "시야 점수" }] as const;
  type SortKey = typeof columns[number]["key"];
  const [sort, setSort] = useState<SortKey>("games");
  const [direction, setDirection] = useState<"ascending" | "descending">("descending");
  const sorted = [...rows].sort((a, b) => { if (a[sort] === null) return b[sort] === null ? b.games - a.games : 1; if (b[sort] === null) return -1; return ((b[sort] ?? 0) - (a[sort] ?? 0)) * (direction === "descending" ? 1 : -1) || b.games - a.games || a.championId - b.championId; }).slice(0, limit);
  function changeSort(value: SortKey) { if (sort === value) setDirection(direction === "descending" ? "ascending" : "descending"); else { setSort(value); setDirection("descending"); } }
  return <section className={styles.panel}><div className={styles.panelHeading}><h3>{limit ? `모스트 ${limit} 챔피언` : "챔피언별 성적"}</h3><label className={styles.inlineLabel}>정렬<select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setDirection("descending"); }}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label></div>
    {!sorted.length ? <p className={styles.empty}>선택한 조건의 챔피언 기록이 없습니다.</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="챔피언별 성적 표"><table className={styles.table}><thead><tr><th scope="col">챔피언</th>{columns.map((column) => <th scope="col" key={column.key} aria-sort={sort === column.key ? direction : "none"}><button className={styles.sortButton} type="button" onClick={() => changeSort(column.key)}>{column.label}{sort === column.key ? direction === "descending" ? " ↓" : " ↑" : ""}</button></th>)}<th scope="col">평균 K / D / A</th></tr></thead><tbody>{sorted.map((row) => <tr key={row.championId}><th scope="row"><button className={styles.championButton} type="button" onClick={() => onSelect(row.championId)} aria-label={`${row.championName} 경기만 보기`}><PlayerChampion participant={row} /><span>{row.championName}</span></button></th><td>{row.games}<small>{row.wins}승 {row.losses}패</small></td><td>{row.winRate}%</td><td>{row.perfect ? "Perfect" : row.kda.toFixed(2)}</td><td>{row.csPerMinute ?? "—"}</td><td>{row.damagePerMinute ?? "—"}<small>경기 평균 {row.averageDamage?.toLocaleString("ko-KR") ?? "—"}</small></td><td>{row.averageGold?.toLocaleString("ko-KR") ?? "—"}</td><td>{row.averageTurretPlates ?? "미수집"}<small>관측 {row.turretPlateGames}/{row.games}경기</small></td><td>{row.killParticipation === null ? "—" : `${row.killParticipation}%`}</td><td>{row.averageVisionScore ?? "—"}</td><td>{row.kills} / {row.deaths} / {row.assists}</td></tr>)}</tbody></table></div>}
    {!limit ? <p className={styles.note}>열 제목을 눌러 정렬 방향을 바꿀 수 있습니다. —는 미수집 수치입니다. 포탑 방패는 Riot이 실제 값을 제공한 경기만 평균을 내며, 관측 경기 수를 함께 표시합니다. 미수집 값을 0개로 계산하지 않습니다.</p> : null}
  </section>;
}

export function PlayerRiotProfile({ summary, initialTab = "overview" }: Readonly<{ summary: PublicRiotSummaryDto; initialTab?: "overview" | "champions" | "report" }>) {
  const [analytics, setAnalytics] = useState<RiotPlayerAnalyticsDto | null>(summary.analytics ?? null);
  const [tab, setTab] = useState<"overview" | "champions" | "report">(initialTab);
  const [encounterSide, setEncounterSide] = useState<"ally" | "enemy">("ally");
  const [filters, setFilters] = useState<PlayerMatchFilters>(DEFAULT_PLAYER_MATCH_FILTERS);
  const [anonymous, setAnonymous] = useState(true);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const favoriteKey = `klol:favorite-player:${summary.playerId}`;
  const favorite = useSyncExternalStore(subscribeFavorites, () => { try { return window.localStorage.getItem(favoriteKey) === "1"; } catch { return false; } }, () => false);
  const matches = useMemo(() => filterPlayerMatches(analytics?.matches ?? [], filters), [analytics, filters]);
  const aggregate = useMemo(() => aggregatePlayerMatches(matches), [matches]);
  const champions = useMemo(() => playerChampionAggregates(matches), [matches]);
  const positions = useMemo(() => playerPositionAggregates(matches), [matches]);
  const recent = [...matches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
  const recentAggregate = aggregatePlayerMatches(recent);
  const rankHistory = analytics?.rankHistory.filter((row) => (filters.year === "ALL" || row.date.startsWith(filters.year)) && (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to)) ?? [];
  async function loadMore() {
    if (!analytics?.nextCursor || loading) return;
    setLoading(true); setLoadFailed(false);
    try {
      const response = await fetch(`/api/riot/player/${encodeURIComponent(summary.playerId)}/analytics?cursor=${encodeURIComponent(analytics.nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const result = await response.json() as { state: string; data?: RiotPlayerAnalyticsDto | null };
      if (result.state !== "ready" || !result.data) throw new Error("LOAD_FAILED");
      const next = result.data;
      setAnalytics((current) => current ? { ...next, matches: [...new Map([...current.matches, ...next.matches].map((match) => [match.matchId, match])).values()] } : next);
    } catch { setLoadFailed(true); } finally { setLoading(false); }
  }
  function toggleFavorite() { try { window.localStorage.setItem(favoriteKey, favorite ? "0" : "1"); window.dispatchEvent(new Event("klol-player-favorites-changed")); setNotice(favorite ? "이 브라우저의 즐겨찾기에서 해제했습니다." : "이 브라우저에 즐겨찾기를 저장했습니다."); } catch { setNotice("브라우저 저장소를 사용할 수 없습니다."); } }
  function selectTab(value: typeof tab) { setTab(value); const url = new URL(window.location.href); url.searchParams.set("tab", "riot"); url.searchParams.set("analysis", value); window.history.replaceState(window.history.state, "", url); }
  async function share() { try { await navigator.clipboard.writeText(`${window.location.origin}/players/${summary.playerId}?tab=riot&analysis=${tab}`); setNotice("플레이어 전적 주소를 복사했습니다."); } catch { setNotice("주소를 복사할 수 없습니다. 브라우저 주소창의 링크를 복사해 주세요."); } }
  return <div className={styles.workspace}>
    <div className={styles.rankHeader}><div><span className={styles.eyebrow}>RIOT MATCH INSIGHTS</span><h3>{summary.soloTier ?? "Unranked"} {summary.soloRank ?? ""}</h3><p>{summary.leaguePoints === null ? "랭크 정보 없음" : `${summary.leaguePoints} LP`} · {summary.wins === null || summary.losses === null ? "승패 미수집" : `${summary.wins}승 ${summary.losses}패`} <small>현재 솔로 랭크 누적</small></p></div><div className={styles.actions}><Button type="button" variant="outline" aria-pressed={favorite} onClick={toggleFavorite}><Star size={15} aria-hidden="true" fill={favorite ? "currentColor" : "none"} />{favorite ? "즐겨찾기 저장됨" : "즐겨찾기"}</Button><Button type="button" variant="outline" onClick={share}><Share2 size={15} aria-hidden="true" />공유</Button></div></div>
    <p className={styles.note}>랭크 갱신: {formatOptionalKoreanDateTime(summary.lastSyncedAt)} · 경기 갱신: {formatOptionalKoreanDateTime(analytics?.updatedAt ?? null)} · <Link href="/account/riot">내 Riot 계정 동기화</Link></p><p role="status" className={styles.notice}>{notice}</p>
    {!analytics ? <div className={styles.empty}>상세 경기 데이터를 아직 수집하지 않았습니다. 동기화가 끝나면 모스트 챔피언, 포지션, 최근 경기와 분석 리포트가 표시됩니다.</div> : <>
      <div className={styles.coverage}><strong>불러온 {analytics.matches.length}경기 · 저장된 {analytics.coverage.collectedGames}경기</strong><span>최근 {analytics.coverage.historyWindowDays}일 수집 범위 · {analytics.coverage.historyComplete ? "조회 범위 수집 완료" : "이전 경기 수집 진행 중"}</span><span>{analytics.coverage.oldestMatchAt ? `${koreanMatchDate(analytics.coverage.oldestMatchAt)} ~ ${koreanMatchDate(analytics.coverage.newestMatchAt ?? analytics.coverage.oldestMatchAt)}` : "수집된 경기 없음"}</span><p>아래 분석은 현재 불러온 경기 표본에만 적용됩니다. 시즌 전체나 다른 플레이어 전체의 통계를 의미하지 않습니다.</p></div>
      <div className={styles.topTabs} aria-label="Riot 전적 분석 메뉴">{([['overview', '종합'], ['champions', '챔피언'], ['report', '분석 리포트']] as const).map(([value, label]) => <Button key={value} type="button" variant={tab === value ? "default" : "outline"} aria-pressed={tab === value} onClick={() => selectTab(value)}>{label}</Button>)}</div>
      <Filters filters={filters} onChange={setFilters} analytics={analytics} />
      <div className={styles.selectionInfo}><p role="status">필터 결과 {matches.length}경기 · 분석 {aggregate.games}경기 · 다시하기 {matches.filter((match) => match.remake).length}경기 제외</p><label><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />다른 소환사 이름 익명 표시</label></div>
      <div className={styles.metricGrid}><article><span>선택한 경기 승률</span><strong>{aggregate.games ? `${aggregate.winRate}%` : "—"}</strong><small>{aggregate.wins}승 {aggregate.losses}패 · {aggregate.games}게임</small></article><article><span>평균 K / D / A</span><strong>{aggregate.games ? `${aggregate.kills} / ${aggregate.deaths} / ${aggregate.assists}` : "—"}</strong><small>KDA {aggregate.games ? aggregate.perfect ? "Perfect" : aggregate.kda.toFixed(2) : "—"}</small></article><article><span>분당 CS · 피해량</span><strong>{aggregate.csPerMinute ?? "—"} · {aggregate.damagePerMinute ?? "—"}</strong><small>미수집 수치는 평균에서 제외</small></article><article><span>킬 관여율 · 시야/분</span><strong>{aggregate.killParticipation === null ? "—" : `${aggregate.killParticipation}%`} · {aggregate.visionPerMinute ?? "—"}</strong><small>각 경기 비율의 평균</small></article></div>
      {tab === "overview" ? <>
        <section className={styles.panel}><div className={styles.panelHeading}><h3>최근 20경기 흐름</h3><span>{recentAggregate.games}게임 · {recentAggregate.wins}승 {recentAggregate.losses}패 · {recentAggregate.winRate}%</span></div><div className={styles.formStrip}>{recent.map((match) => <span key={match.matchId} data-result={match.remake ? "remake" : selfParticipant(match)?.win ? "win" : "loss"} title={`${koreanMatchDate(match.startedAt)} · ${queueLabel(match.queueId)}`}>{match.remake ? "무" : selfParticipant(match)?.win ? "승" : "패"}</span>)}</div><p className={styles.note}>현재 필터에 해당하는 경기 중 최신순이며, 다시하기는 성적에서 제외합니다. 최근 KDA {recentAggregate.games ? recentAggregate.perfect ? "Perfect" : recentAggregate.kda.toFixed(2) : "—"} · {recentAggregate.kills} / {recentAggregate.deaths} / {recentAggregate.assists}</p><div className={styles.recentMost} aria-label="최근 20경기 모스트 3">{playerChampionAggregates(recent).slice(0, 3).map((row) => <button type="button" key={row.championId} className={styles.championButton} onClick={() => setFilters({ ...filters, champion: String(row.championId) })}><PlayerChampion participant={row} /><span>{row.championName}<small>{row.games}게임 · {row.winRate}% · KDA {row.perfect ? "Perfect" : row.kda}</small></span></button>)}</div></section>
        <div className={styles.twoColumns}><ChampionTable rows={champions} limit={10} onSelect={(id) => setFilters({ ...filters, champion: String(id) })} /><section className={styles.panel}><h3>라인별 비율 · 승률</h3><div className={styles.positionList}>{positions.filter((row) => row.position !== "UNKNOWN" || row.games > 0).map((row) => <button key={row.position} type="button" onClick={() => setFilters({ ...filters, position: row.position })} aria-label={`${row.label} 경기만 보기`}><div><strong>{row.label}</strong><span>{row.share}% · {row.games}게임</span></div><meter min={0} max={100} value={row.share} aria-label={`${row.label} 플레이 비율`} /><small>{row.wins}승 {row.losses}패 · 승률 {row.winRate}% · KDA {row.games ? row.perfect ? "Perfect" : row.kda.toFixed(2) : "—"}</small></button>)}</div></section></div>
        <PlayerHistoryChart matches={matches} rankHistory={rankHistory} />
      </> : tab === "champions" ? <><ChampionTable rows={champions} onSelect={(id) => setFilters({ ...filters, champion: String(id) })} /><section className={styles.panel}><h3>이 플레이어의 빌드 기록</h3><p className={styles.note}>선택한 경기 표본의 최종 아이템·룬·주문 조합입니다. 챔피언 필터로 범위를 좁힐 수 있으며, 전체 서버 추천 빌드가 아닙니다. 같은 게임 종류·맵별로 나누며 채택률 분모는 해당 종류·맵의 선택 경기입니다.</p><div className={styles.threeColumns}>{([['items', '최종 아이템', 'item'], ['runes', '룬', 'rune'], ['spells', '소환사 주문', 'spell']] as const).map(([kind, label, asset]) => <div key={kind}><h4>{label}</h4>{playerBuildAggregates(matches, kind).slice(0, 5).map((row, index) => <div key={index} className={styles.buildRow}><small>{queueLabel(row.queueId)} · 같은 모드 표본 {row.eligibleGames}경기</small><div className={styles.assets}>{row.ids.map((id, i) => <PlayerAsset kind={asset} id={id} key={i} />)}</div><small>{row.games}게임 · {row.wins}승 · 승률 {row.winRate}% · 채택률 {row.eligibleGames ? Math.round(row.games / row.eligibleGames * 1000) / 10 : 0}%</small></div>)}</div>)}</div></section><PlayerBuildInsights playerId={summary.playerId} matches={matches} /></> : <section className={styles.panel}><h3>K-LOL 경기 분석 리포트</h3><p className={styles.note}>Riot 경기 사실을 직접 계산한 리포트입니다. 다른 서비스의 비공개 인분·팀운·멘탈 점수, 전체 티어 대비 백분위, AI 판정을 제공하지 않습니다.</p><div className={styles.reportGrid}>{playerReportMetrics(matches).map((row) => <article key={row.id}><span>{row.label}</span><strong>{row.value ?? "미수집"}</strong><small>{row.unit} · 표본 {row.games}경기</small><p>{row.formula}</p></article>)}</div><p className={styles.note}>서로 다른 포지션과 게임 종류는 수치의 의미가 다릅니다. 위 필터로 비교 범위를 맞춰 확인하세요.</p><PlayerHistoryChart matches={matches} rankHistory={rankHistory} /><PlayerReportHistory playerId={summary.playerId} riotId={summary.riotId} updatedAt={analytics.updatedAt} filters={filters} matches={matches} /></section>}
      <div className={styles.twoColumns}>
        <section className={styles.panel}><h3>함께 만난 소환사</h3><div className={styles.segmented} aria-label="함께 만난 소환사 팀 구분"><button type="button" aria-pressed={encounterSide === "ally"} onClick={() => setEncounterSide("ally")}>같은 팀</button><button type="button" aria-pressed={encounterSide === "enemy"} onClick={() => setEncounterSide("enemy")}>상대 팀</button></div><p className={styles.note}>{encounterSide === "ally" ? "같은 팀으로 만난 횟수입니다. 사전 구성 파티 여부는 알 수 없습니다." : "상대 팀으로 만난 횟수와 본인의 승률입니다."}</p><ol className={styles.encounters}>{playerEncounters(matches, encounterSide).slice(0, 8).map((row, index) => <li key={row.label}><span>{anonymous ? `함께한 소환사 ${index + 1}` : <Link href={`/players?q=${encodeURIComponent(row.label)}`} title="K-LOL 플레이어 찾기" aria-label={`${row.label} K-LOL 플레이어 찾기`}>{row.label}</Link>}</span><strong>{row.games}게임 · {row.winRate}%</strong></li>)}</ol>{!playerEncounters(matches, encounterSide).length ? <p className={styles.empty}>비교할 기록이 없습니다.</p> : null}</section>
        <section className={styles.panel}><h3>동일 포지션 상대 챔피언</h3><p className={styles.note}>같은 포지션으로 기록된 상대와의 경기 결과입니다. 챔피언 필터를 선택하면 해당 챔피언의 상성 표본만 비교합니다. 적은 경기의 승률을 일반적인 유불리로 단정할 수 없습니다.</p><ol className={styles.encounters}>{playerEncounters(matches, "opponent").slice(0, 8).map((row) => <li key={row.label}><span>{row.label}<small className={styles.blockNote}>15분 골드 차이 {row.goldDiffAt15 === null ? "미수집" : `${row.goldDiffAt15 > 0 ? "+" : ""}${row.goldDiffAt15}`} · 표본 {row.laneGames}경기</small></span><strong>{row.games}게임 · {row.winRate}%</strong></li>)}</ol>{!playerEncounters(matches, "opponent").length ? <p className={styles.empty}>비교할 기록이 없습니다.</p> : null}</section>
      </div>
      <section aria-labelledby="riot-recent-matches"><div className={styles.panelHeading}><h3 id="riot-recent-matches">경기 기록</h3><span>{matches.length}경기 · 경기를 눌러 참가자 기록 확인</span></div><div className={styles.stack}>{matches.map((match) => <PlayerMatchDetail key={match.matchId} match={match} anonymous={anonymous} playerId={summary.playerId} />)}</div>{matches.length === 0 ? <p className={styles.empty}>선택한 조건과 일치하는 경기가 없습니다. 필터를 초기화하거나 이전 경기를 더 불러와 주세요.</p> : null}</section>
      {analytics.nextCursor ? <div className={styles.more}><Button type="button" variant="outline" disabled={loading} onClick={loadMore}>{loading ? "이전 경기 불러오는 중…" : "이전 경기 더 보기"}</Button><p className={styles.note}>추가로 불러온 경기도 현재 필터와 분석에 반영합니다.</p>{loadFailed ? <p role="alert">이전 경기를 불러오지 못했습니다. 다시 시도해 주세요.</p> : null}</div> : null}
    </>}
  </div>;
}
