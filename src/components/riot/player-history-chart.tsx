"use client";
import { useState } from "react";
import type { RiotMatchDto, RiotRankHistoryDto } from "@/modules/riot/domain/riot-player-analytics";
import { playerDailyAggregates, playerRankPoints } from "./player-analytics";
import styles from "./player-riot-profile.module.css";

export function PlayerHistoryChart({ matches, rankHistory }: Readonly<{ matches: readonly RiotMatchDto[]; rankHistory: readonly RiotRankHistoryDto[] }>) {
  const [metric, setMetric] = useState<"games" | "winRate" | "kda" | "rank">("games");
  const daily = playerDailyAggregates(matches);
  const data = metric === "rank" ? rankHistory.map((row) => ({ date: row.date, value: playerRankPoints(row), label: `${row.tier ?? "Unranked"} ${row.rank ?? ""} ${row.leaguePoints ?? "—"} LP` })).filter((row): row is { date: string; value: number; label: string } => row.value !== null) : daily.map((row) => ({ date: row.date, value: metric === "games" ? row.games : metric === "kda" ? row.kda : row.winRate, label: metric === "games" ? `${row.games}게임 · ${row.wins}승 ${row.losses}패` : metric === "kda" ? `${row.perfect ? "Perfect" : row.kda.toFixed(2)} KDA · ${row.kills} / ${row.deaths} / ${row.assists} · ${row.games}게임` : `${row.winRate}% · ${row.games}게임` }));
  const max = Math.max(metric === "winRate" ? 100 : 1, ...data.map((row) => row.value));
  const min = metric === "rank" && data.length > 1 ? Math.min(...data.map((row) => row.value)) - 20 : 0;
  const plotY = (value: number) => 146 - (value - min) / Math.max(1, max - min) * 110;
  const x = (index: number) => data.length <= 1 ? 320 : 40 + index / (data.length - 1) * 560;
  return <section className={styles.panel} aria-labelledby="riot-history-title">
    <div className={styles.panelHeading}><h3 id="riot-history-title">날짜별 변화</h3><div className={styles.segmented} aria-label="변화 차트 항목">{([['games', '게임 수'], ['winRate', '승률'], ['kda', 'KDA'], ['rank', '티어 · LP']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)}>{label}</button>)}</div></div>
    <p className={styles.note}>{metric === "rank" ? "티어 · LP는 실제 동기화한 날짜의 마지막 관측값입니다. 경기 필터와 별개로 선택한 연도·기간만 반영하며, 과거 값을 추정하지 않습니다." : "한국 시간 기준으로 선택한 경기 표본을 날짜별 집계합니다. 다시하기는 제외합니다."}</p>
    {!data.length ? <p className={styles.empty}>{metric === "rank" ? "아직 누적된 랭크 관측값이 없습니다. 동기화한 날부터 기록됩니다." : "선택한 기간의 경기 기록이 없습니다."}</p> : <>
      <svg viewBox="0 0 640 185" role="img" aria-label={`${metric === "games" ? "일별 게임 수" : metric === "winRate" ? "일별 승률" : metric === "kda" ? "일별 KDA" : "랭크 관측"} 차트. 아래 표에서 정확한 값을 확인할 수 있습니다.`} className={styles.chart}>
        {[0, .5, 1].map((ratio) => <g key={ratio}><line x1="40" x2="600" y1={146 - ratio * 110} y2={146 - ratio * 110} stroke="currentColor" opacity=".13" /><text x="34" y={150 - ratio * 110} textAnchor="end" fontSize="10" fill="currentColor">{Math.round(min + ratio * (max - min))}</text></g>)}
        {metric === "games" ? data.map((row, index) => <rect key={row.date} x={x(index) - Math.min(12, 230 / data.length)} y={plotY(row.value)} width={Math.min(24, 460 / data.length)} height={146 - plotY(row.value)} rx="3" fill="var(--primary)"><title>{row.date}: {row.label}</title></rect>) : <><polyline points={data.map((row, index) => `${x(index)},${plotY(row.value)}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2.5" />{data.map((row, index) => <circle key={row.date} cx={x(index)} cy={plotY(row.value)} r="3" fill="var(--primary)"><title>{row.date}: {row.label}</title></circle>)}</>}
        <text x="40" y="173" fill="currentColor" fontSize="11">{data[0].date}</text><text x="600" y="173" textAnchor="end" fill="currentColor" fontSize="11">{data.at(-1)!.date}</text>
      </svg>
      {metric === "rank" ? <p className={styles.note}>{data.length === 1 ? "첫 관측값입니다. 두 번째 날짜부터 변화를 비교할 수 있습니다. " : ""}그래프는 티어·단계 간격을 환산한 좌표입니다. 마스터 이상은 같은 기준점 + LP로 표시하며, 게임 MMR을 뜻하지 않습니다.</p> : null}
      {metric === "kda" ? <p className={styles.note}>차트 KDA = (해당 날짜의 총 킬 + 총 어시스트) ÷ max(1, 총 사망)입니다. 0사망이면서 킬 관여가 있는 날은 표에서 Perfect로 구분합니다.</p> : null}
      <details className={styles.chartTable}><summary>날짜별 수치 표 보기 ({data.length}일)</summary><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="날짜별 수치 표"><table className={styles.table}><thead><tr><th scope="col">날짜</th><th scope="col">{metric === "rank" ? "관측 랭크" : "경기 결과"}</th></tr></thead><tbody>{data.map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.label}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
