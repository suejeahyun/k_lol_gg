"use client";
import { useState } from "react";
import type { RiotMatchDto } from "@/modules/riot/domain/riot-player-analytics";
import { MATCH_CHART_LABELS, matchGrowthSeries, type MatchChartMetric } from "./player-match-series";
import styles from "./player-riot-profile.module.css";

const minute = (milliseconds: number) => `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;
export function PlayerMatchChart({ match }: Readonly<{ match: RiotMatchDto }>) {
  const [metric, setMetric] = useState<MatchChartMetric>("totalGold");
  const rows = matchGrowthSeries(match, metric);
  const values = rows.flatMap((row) => [row.value, row.opponent]).filter((value): value is number => value !== null);
  const maximum = Math.max(1, ...values), minimum = Math.min(0, ...values);
  const start = rows[0]?.timestamp ?? 0, end = rows.at(-1)?.timestamp ?? 1;
  const x = (timestamp: number) => 60 + (timestamp - start) / Math.max(1, end - start) * 540;
  const y = (value: number) => 155 - (value - minimum) / (maximum - minimum) * 125;
  const path = (field: "value" | "opponent") => {
    let previous: number | null = null;
    return rows.map((row) => {
      const value = row[field];
      if (value === null) { previous = null; return ""; }
      const adjacent = previous !== null && row.timestamp - previous <= Math.max(60_000, match.timeline?.frameInterval ?? 60_000) * 1.5;
      previous = row.timestamp;
      return `${adjacent ? "L" : "M"}${x(row.timestamp)},${y(value)}`;
    }).join(" ");
  };
  return <section className={styles.stack} aria-label="경기 성장 그래프">
    <div className={styles.panelHeading}><h4>시간대별 성장 그래프</h4><div className={styles.segmented} aria-label="경기 성장 지표">{Object.entries(MATCH_CHART_LABELS).map(([key, label]) => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key as MatchChartMetric)}>{label}</button>)}</div></div>
    <p className={styles.note}>{metric === "teamGold" ? "아군 총 골드 − 상대 팀 총 골드. 양수는 아군 우세입니다." : "실선은 본인, 점선은 같은 포지션의 상대입니다. 상대 포지션이 불명확하면 비교선을 표시하지 않습니다."} 미수집 구간은 선으로 연결하지 않습니다.</p>
    {!values.length ? <p className={styles.empty}>이 지표의 시간별 관측값이 없습니다.</p> : <svg viewBox="0 0 640 190" className={styles.chart} role="img" aria-label={`${MATCH_CHART_LABELS[metric]} 경기 성장 그래프. 아래 표에서 각 시점의 값을 확인할 수 있습니다.`}>
      {[0, .5, 1].map((ratio) => <g key={ratio}><line x1="60" x2="600" y1={155 - ratio * 125} y2={155 - ratio * 125} stroke="currentColor" opacity=".15" /><text x="54" y={159 - ratio * 125} textAnchor="end" fontSize="10" fill="currentColor">{Math.round(minimum + ratio * (maximum - minimum)).toLocaleString("ko-KR")}</text></g>)}
      <path d={path("value")} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      <path d={path("opponent")} fill="none" stroke="var(--destructive)" strokeWidth="2" strokeDasharray="6 4" />
      {rows.map((row) => <g key={row.timestamp}>{row.value !== null ? <circle cx={x(row.timestamp)} cy={y(row.value)} r="2.5" fill="var(--primary)"><title>{minute(row.timestamp)} 본인: {row.value}</title></circle> : null}{row.opponent !== null ? <circle cx={x(row.timestamp)} cy={y(row.opponent)} r="2" fill="var(--destructive)"><title>{minute(row.timestamp)} 상대: {row.opponent}</title></circle> : null}</g>)}
      <text x="60" y="180" fontSize="11" fill="currentColor">{minute(start)}</text><text x="600" y="180" textAnchor="end" fontSize="11" fill="currentColor">{minute(end)}</text>
    </svg>}
    <details className={styles.chartTable}><summary>성장 그래프 수치 표 보기</summary><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="성장 그래프 수치 표"><table className={styles.table}><thead><tr><th scope="col">시간</th><th scope="col">{metric === "teamGold" ? "아군 − 상대 골드" : `본인 ${MATCH_CHART_LABELS[metric]}`}</th>{metric !== "teamGold" ? <th scope="col">같은 포지션 상대</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.timestamp}><th scope="row">{minute(row.timestamp)}</th><td>{row.value?.toLocaleString("ko-KR") ?? "미수집"}</td>{metric !== "teamGold" ? <td>{row.opponent?.toLocaleString("ko-KR") ?? "미수집"}</td> : null}</tr>)}</tbody></table></div></details>
  </section>;
}
