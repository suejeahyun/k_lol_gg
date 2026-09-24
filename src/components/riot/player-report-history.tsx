"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { RiotMatchDto } from "@/modules/riot/domain/riot-player-analytics";
import { formatOptionalKoreanDateTime } from "@/platform/time/format-korean-date-time";
import { PLAYER_POSITION_LABELS, queueLabel, type PlayerMatchFilters } from "./player-analytics";
import { createPlayerReportSnapshot, parsePlayerReportSnapshots, PLAYER_REPORT_SNAPSHOT_LIMIT, playerReportStorageKey } from "./player-report-snapshot";
import styles from "./player-riot-profile.module.css";

function subscribe(listener: () => void) { window.addEventListener("storage", listener); window.addEventListener("klol-riot-report-changed", listener); return () => { window.removeEventListener("storage", listener); window.removeEventListener("klol-riot-report-changed", listener); }; }
function filterLabels(filters: PlayerMatchFilters) {
  return [`연도 ${filters.year === "ALL" ? "전체" : filters.year}`, filters.queue === "ALL" ? "모든 게임" : queueLabel(Number(filters.queue)), `패치 ${filters.patch === "ALL" ? "전체" : filters.patch}`, filters.position === "ALL" ? "모든 포지션" : PLAYER_POSITION_LABELS[filters.position as keyof typeof PLAYER_POSITION_LABELS] ?? filters.position, `챔피언 ${filters.champion === "ALL" ? "전체" : filters.champion}`, `결과 ${{ ALL: "전체", win: "승리", loss: "패배", remake: "다시하기" }[filters.result] ?? filters.result}`, `${filters.from || "수집 시작"} ~ ${filters.to || "수집 끝"}`].join(" · ");
}
export function PlayerReportHistory({ playerId, riotId, updatedAt, filters, matches }: Readonly<{ playerId: string; riotId: string; updatedAt: string; filters: PlayerMatchFilters; matches: readonly RiotMatchDto[] }>) {
  const storageKey = playerReportStorageKey(playerId, riotId);
  const raw = useSyncExternalStore(subscribe, () => { try { return window.localStorage.getItem(storageKey); } catch { return null; } }, () => null);
  const snapshots = parsePlayerReportSnapshots(raw, playerId, riotId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const selected = snapshots.find((row) => row.id === selectedId) ?? null;
  function write(next: typeof snapshots) { try { window.localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event("klol-riot-report-changed")); return true; } catch { setMessage("브라우저 저장 공간을 사용할 수 없습니다. 저장되지 않았습니다."); return false; } }
  function save() {
    const snapshot = createPlayerReportSnapshot({ id: crypto.randomUUID(), playerId, riotId, createdAt: new Date().toISOString(), sourceUpdatedAt: updatedAt, filters, matches });
    if (write([snapshot, ...snapshots].slice(0, PLAYER_REPORT_SNAPSHOT_LIMIT))) { setSelectedId(snapshot.id); setMessage("현재 기기에 리포트를 저장했습니다. 서버나 다른 기기에 공유되지 않습니다."); }
  }
  return <section className={styles.panel} aria-labelledby="riot-report-history-title"><div className={styles.panelHeading}><h3 id="riot-report-history-title">분석 저장 · 이전 결과</h3><Button type="button" variant="outline" disabled={matches.length === 0} onClick={save}>현재 분석 저장</Button></div>
    <p className={styles.note}>규칙 기반 분석의 필터·표본·계산 결과를 이 브라우저에 최대 {PLAYER_REPORT_SNAPSHOT_LIMIT}개 보관하며, 초과하면 가장 오래된 기록부터 교체합니다. 서버 저장이나 AI 분석이 아니며, 같은 플레이어·같은 Riot ID의 기록만 표시합니다. 저장한 결과는 이후 동기화로 바뀌지 않습니다.</p><p role="status" className={styles.notice}>{message}</p>
    {snapshots.length ? <ol className={styles.snapshotList}>{snapshots.map((row) => <li key={row.id}><button type="button" aria-pressed={selectedId === row.id} onClick={() => setSelectedId(row.id)}><strong>{formatOptionalKoreanDateTime(row.createdAt)}</strong><small>{row.aggregate.games}경기 · {row.aggregate.winRate}% · {row.metrics.filter((metric) => metric.games > 0).length}/6개 지표</small></button><Button type="button" variant="ghost" aria-label={`${formatOptionalKoreanDateTime(row.createdAt)} 리포트 삭제`} onClick={() => { if (write(snapshots.filter((item) => item.id !== row.id))) { if (selectedId === row.id) setSelectedId(null); setMessage("이 기기의 저장 리포트를 삭제했습니다."); } }}>삭제</Button></li>)}</ol> : <p className={styles.empty}>아직 이 기기에 저장한 분석이 없습니다.</p>}
    {selected ? <div className={styles.savedReport}><div className={styles.panelHeading}><h4>저장한 당시의 분석</h4><Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>닫기</Button></div><p className={styles.note}>생성 {formatOptionalKoreanDateTime(selected.createdAt)} · 데이터 기준 {formatOptionalKoreanDateTime(selected.sourceUpdatedAt)} · 산식 {selected.formulaVersion}</p><p className={styles.note}>{filterLabels(selected.filters)}</p><div className={styles.metricGrid}><article><span>저장 표본</span><strong>{selected.aggregate.games}경기</strong><small>원본 선택 {selected.matchIds.length}경기 · 다시하기 제외</small></article><article><span>승패 · 승률</span><strong>{selected.aggregate.winRate}%</strong><small>{selected.aggregate.wins}승 {selected.aggregate.losses}패</small></article><article><span>평균 K / D / A</span><strong>{selected.aggregate.kills} / {selected.aggregate.deaths} / {selected.aggregate.assists}</strong><small>KDA {selected.aggregate.perfect ? "Perfect" : selected.aggregate.kda.toFixed(2)}</small></article></div><div className={styles.reportGrid}>{selected.metrics.map((metric) => <article key={metric.id}><span>{metric.label}</span><strong>{metric.value ?? "미수집"}</strong><small>{metric.unit} · 표본 {metric.games}경기</small><p>{metric.formula}</p></article>)}</div><div className={styles.twoColumns}><div><h4>저장 모스트 챔피언</h4><ul className={styles.events}>{selected.champions.slice(0, 10).map((row) => <li key={row.championId}>{row.championName} · {row.games}게임 · {row.winRate}%</li>)}</ul></div><div><h4>저장 포지션</h4><ul className={styles.events}>{selected.positions.filter((row) => row.games > 0).map((row) => <li key={row.label}>{row.label} · {row.games}게임 · 비율 {row.share}% · 승률 {row.winRate}%</li>)}</ul></div></div></div> : null}
  </section>;
}
