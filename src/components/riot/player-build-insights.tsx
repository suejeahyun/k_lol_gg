"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RiotMatchDto } from "@/modules/riot/domain/riot-player-analytics";
import { PlayerAsset } from "./player-match-detail";
import { playerTimelineBuilds } from "./player-build-analytics";
import { queueLabel } from "./player-analytics";
import styles from "./player-riot-profile.module.css";

export function PlayerBuildInsights({ playerId, matches }: Readonly<{ playerId: string; matches: readonly RiotMatchDto[] }>) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, RiotMatchDto>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const activeMatches = matches.map((match) => loaded.get(match.matchId) ?? match);
  const pending = activeMatches.filter((match) => !match.remake && match.timelineDeferred && !match.timeline);
  const collected = activeMatches.filter((match) => !match.remake && match.timeline).length;
  async function collect() {
    if (request.current || !pending.length) return;
    const batch = pending.slice(0, 40); const controller = new AbortController(); request.current = controller;
    setProgress({ done: 0, total: batch.length }); setMessage(""); let failed = 0; const results: RiotMatchDto[] = [];
    try {
      for (let index = 0; index < batch.length && !controller.signal.aborted; index += 3) {
        const group = await Promise.allSettled(batch.slice(index, index + 3).map(async (match) => {
          const response = await fetch(`/api/riot/player/${encodeURIComponent(playerId)}/matches/${encodeURIComponent(match.matchId)}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("MATCH_UNAVAILABLE");
          const result = await response.json() as { state: string; data?: RiotMatchDto | null };
          if (result.state !== "ready" || !result.data || result.data.matchId !== match.matchId || result.data.timelineDeferred) throw new Error("MATCH_UNAVAILABLE");
          return result.data;
        }));
        for (const result of group) { if (result.status === "fulfilled") results.push(result.value); else failed++; }
        if (!controller.signal.aborted) setProgress({ done: Math.min(index + 3, batch.length), total: batch.length });
      }
      if (!controller.signal.aborted) { setLoaded((current) => new Map([...current, ...results.map((match) => [match.matchId, match] as const)])); setMessage(failed ? `${results.length}경기를 불러왔습니다. ${failed}경기는 실패하여 다시 시도할 수 있습니다.` : `${results.length}경기의 저장된 타임라인을 불러왔습니다.`); }
    } finally { if (!controller.signal.aborted) setProgress(null); request.current = null; }
  }
  return <section className={styles.panel}><div className={styles.panelHeading}><h3>구매 순서별 빌드 · 스킬 분석</h3>{pending.length ? <Button type="button" variant="outline" disabled={!!progress} onClick={collect}>{progress ? `${progress.done}/${progress.total}경기 불러오는 중…` : `구매 기록 ${Math.min(40, pending.length)}경기 분석하기`}</Button> : null}</div>
    <p className={styles.note}>현재 선택한 경기 중 타임라인 {collected}경기를 분석합니다. 미리 수집된 경기만 읽으며 Riot에 새 동기화를 요청하지 않습니다. 첫 90초 구매를 시작 아이템으로, 해당 경기 맵에서 추가 업그레이드가 없고 1,000골드 이상인 아이템을 완성 코어로 분류합니다. 신발·소모품은 코어에서 제외하고 구매 취소는 되돌립니다. 정적 분류 기준은 Data Dragon 16.17.1이며 해당 맵에서 사용 가능한 아이템만 코어·신발로 분류합니다.</p>
    <p className={styles.note}>서로 다른 게임 종류·맵의 조합은 별도로 집계하며, 채택률 분모는 같은 종류·맵의 타임라인을 불러온 유효 경기입니다. 해당 코어 완성 전에 끝난 경기도 분모에 포함합니다. 게임 종류·패치·챔피언·라인 필터를 맞춰 비교해 주세요.</p><p className={styles.notice} role="status">{message}</p>
    <div className={styles.threeColumns}>{([['start', '시작 아이템'], ['boots', '신발'], ['core1', '1코어'], ['core2', '2코어 순서'], ['core3', '3코어 순서'], ['skills', '스킬 선택 순서']] as const).map(([kind, label]) => { const group = playerTimelineBuilds(activeMatches, kind); return <section key={kind}><h4>{label}</h4>{group.rows.slice(0, 5).map((row, index) => <div className={styles.buildRow} key={index}><small>{queueLabel(row.queueId)} · 같은 모드 표본 {row.eligibleGames}경기</small><div className={styles.assets}>{kind === "skills" ? row.ids.map((id, i) => <span key={i} className={styles.skillPill} title={`${i + 1}번째 레벨업`}>{["", "Q", "W", "E", "R"][id] ?? "?"}</span>) : row.ids.map((id, i) => <PlayerAsset key={i} kind="item" id={id} />)}</div><small>{row.games}게임 · 승률 {row.winRate}% · 채택률 {row.pickRate}%</small></div>)}{!group.rows.length ? <p className={styles.note}>{group.eligibleGames ? "수집된 표본에서 이 조합을 확인하지 못했습니다." : "분석할 타임라인을 불러와 주세요."}</p> : null}</section>; })}</div>
  </section>;
}
