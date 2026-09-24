"use client";

/* eslint-disable @next/next/no-img-element -- Pinned Riot Data Dragon assets use their public CDN with a text fallback. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChampionPortrait } from "@/components/champions/champion-portrait";
import { DATA_DRAGON_VERSION } from "@/modules/champions/domain/data-dragon-catalog";
import type { RiotMatchDto, RiotMatchParticipantDto } from "@/modules/riot/domain/riot-player-analytics";
import { formatKoreanDateTime } from "@/platform/time/format-korean-date-time";
import { PLAYER_ITEMS, PLAYER_RUNES, PLAYER_SPELLS } from "./player-asset-catalog";
import { PlayerMatchChart } from "./player-match-chart";
import { PLAYER_POSITION_LABELS, playerChampionName, playerLaneSnapshot, queueLabel, selfParticipant } from "./player-analytics";
import styles from "./player-riot-profile.module.css";

export function PlayerAsset({ id, kind }: Readonly<{ id: number; kind: "item" | "rune" | "spell" }>) {
  const [failed, setFailed] = useState(false);
  const asset = (kind === "item" ? PLAYER_ITEMS : kind === "rune" ? PLAYER_RUNES : PLAYER_SPELLS)[id];
  const title = asset?.name ?? (id === 0 ? "빈 슬롯" : `${kind === "item" ? "아이템" : kind === "rune" ? "룬" : "주문"} ${id}`);
  const url = asset ? (kind === "rune" ? `https://ddragon.leagueoflegends.com/cdn/img/${asset.icon}` : `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/${kind === "item" ? "item" : "spell"}/${asset.icon}`) : null;
  return <span className={styles.asset} title={title}>{url && !failed ? <img src={url} alt={title} width={28} height={28} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-label={title}>{id === 0 ? "·" : asset?.name.slice(0, 2) ?? id}</span>}</span>;
}
export function PlayerChampion({ participant }: Readonly<{ participant: Pick<RiotMatchParticipantDto, "championId" | "championName"> }>) {
  return <ChampionPortrait displayName={playerChampionName(participant)} championKey={String(participant.championId)} imageUrl={null} />;
}
function stat(value: number | null) { return value === null ? "—" : value.toLocaleString("ko-KR"); }
export function matchDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
const objectiveLabels: Readonly<Record<string, string>> = { baron: "바론", dragon: "드래곤", tower: "포탑", inhibitor: "억제기", riftHerald: "전령", horde: "공허 유충", atakhan: "아타칸", champion: "킬" };
const monsterLabels: Readonly<Record<string, string>> = { BARON_NASHOR: "바론", DRAGON: "드래곤", RIFTHERALD: "전령", HORDE: "공허 유충", ATAKHAN: "아타칸" };

function MatchScoreboard({ match, anonymous }: Readonly<{ match: RiotMatchDto; anonymous: boolean }>) {
  const maxDamage = Math.max(1, ...match.participants.map((row) => row.damageToChampions ?? 0));
  const classicTeams = match.teams.length === 2 && match.teams.every((team) => [100, 200].includes(team.teamId));
  const teamLabel = (id: number) => classicTeams ? `${id === 100 ? "블루" : "레드"} 팀` : `팀 ${id}`;
  return <div className={styles.stack}>{match.teams.map((team) => <section key={team.teamId} aria-label={`${teamLabel(team.teamId)} 스코어보드`}>
    <div className={styles.teamHeading}><strong>{team.win ? "승리" : "패배"} · {teamLabel(team.teamId)}</strong><span>{team.objectives.map((objective) => `${objectiveLabels[objective.type] ?? objective.type} ${objective.kills}`).join(" · ")}</span></div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${team.teamId} 팀 경기 수치 표`}><table className={styles.table}><thead><tr><th scope="col">플레이어</th><th scope="col">K / D / A</th><th scope="col">챔피언 피해량</th><th scope="col">골드 · CS</th><th scope="col">시야</th><th scope="col">아이템 · 주문</th></tr></thead><tbody>
      {match.participants.filter((row) => row.teamId === team.teamId).map((row) => <tr key={row.participantId} data-self={row.participantId === match.selfParticipantId || undefined}>
        <th scope="row"><div className={styles.championCell}><PlayerChampion participant={row} /><span>{row.participantId === match.selfParticipantId ? "본인" : anonymous ? `플레이어 ${row.participantId}` : row.riotId ? <Link href={`/players?q=${encodeURIComponent(row.riotId)}`} title="K-LOL 플레이어 찾기">{row.riotId}</Link> : "이름 정보 없음"}<small>{playerChampionName(row)} · {PLAYER_POSITION_LABELS[row.position ?? "UNKNOWN"]} · Lv.{row.champLevel ?? "—"}</small></span></div></th>
        <td>{row.kills} / {row.deaths} / {row.assists}<small>{row.deaths === 0 && row.kills + row.assists > 0 ? "Perfect" : `${((row.kills + row.assists) / Math.max(1, row.deaths)).toFixed(2)} KDA`}</small></td>
        <td>{stat(row.damageToChampions)}{row.damageToChampions !== null ? <meter min={0} max={maxDamage} value={row.damageToChampions} aria-label={`${playerChampionName(row)} 피해량`} /> : null}<small>받은 피해 {stat(row.damageTaken)}</small></td>
        <td>{stat(row.goldEarned)}<small>CS {stat(row.cs)} ({row.cs !== null && match.durationSeconds > 0 ? (row.cs / (match.durationSeconds / 60)).toFixed(1) : "—"}/분)</small></td>
        <td>{stat(row.visionScore)}<small>설치 {stat(row.wardsPlaced)} / 제거 {stat(row.wardsKilled)}</small></td>
        <td><div className={styles.assets}>{row.items.map((id, i) => <PlayerAsset key={`item-${i}`} id={id} kind="item" />)}</div><div className={styles.assets}>{row.summonerSpells.map((id, i) => <PlayerAsset key={`spell-${i}`} id={id} kind="spell" />)}</div></td>
      </tr>)}
    </tbody></table></div>
    {team.bans.some((id) => id > 0) ? <p className={styles.bans}>밴 {team.bans.filter((id) => id > 0).map((id) => <PlayerChampion key={id} participant={{ championId: id, championName: String(id) }} />)}</p> : null}
  </section>)}</div>;
}

function MatchTimeline({ match }: Readonly<{ match: RiotMatchDto }>) {
  if (!match.timeline) return <p className={styles.empty}>{match.timelineStatus === "UNAVAILABLE" ? "이 경기의 타임라인을 표시할 수 없습니다. 제공되지 않거나 지원하지 않는 형식일 수 있으며, 최종 경기 기록은 스코어보드에서 확인할 수 있습니다." : "이 경기의 타임라인은 아직 수집되지 않았습니다. 동기화가 진행되면 다시 확인해 주세요."}</p>;
  const self = selfParticipant(match)!;
  const ownEvents = match.timeline.events.filter((event) => event.participantId === self.participantId);
  const skills = ownEvents.filter((event) => event.type === "SKILL_LEVEL_UP");
  const items = ownEvents.filter((event) => ["ITEM_PURCHASED", "ITEM_SOLD", "ITEM_UNDO"].includes(event.type));
  const objectives = match.timeline.events.filter((event) => ["ELITE_MONSTER_KILL", "BUILDING_KILL"].includes(event.type));
  const frames = match.timeline.frames.filter((frame, index) => index % 5 === 0 || index === match.timeline!.frames.length - 1);
  const otherTeams = [...new Set(match.participants.filter((row) => row.teamId !== self.teamId).map((row) => row.teamId))];
  return <div className={styles.stack}>
    <PlayerMatchChart match={match} />
    <section><h4>아이템 구매 순서</h4><p className={styles.note}>판매와 구매 취소를 포함한 실제 이벤트입니다.</p><ol className={styles.buildOrder}>{items.map((event, index) => <li key={index}><small>{matchDuration(Math.floor(event.timestamp / 1000))}</small>{event.itemId ? <PlayerAsset id={event.itemId} kind="item" /> : <span>{event.beforeId ? PLAYER_ITEMS[event.beforeId]?.name ?? event.beforeId : "아이템"}</span>}<span>{event.type === "ITEM_SOLD" ? "판매" : event.type === "ITEM_UNDO" ? "취소" : "구매"}</span></li>)}</ol>{items.length === 0 ? <p>구매 이벤트가 없습니다.</p> : null}</section>
    <section><h4>스킬 순서</h4><ol className={styles.skillOrder}>{skills.map((event, index) => <li key={index} title={matchDuration(Math.floor(event.timestamp / 1000))}><small>{index + 1}</small><strong>{["", "Q", "W", "E", "R"][event.skillSlot ?? 0] || "?"}</strong></li>)}</ol></section>
    <section><h4>시간대별 성장</h4><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="시간대별 성장 표"><table className={styles.table}><thead><tr><th scope="col">시간</th><th scope="col">골드</th><th scope="col">CS</th><th scope="col">레벨</th><th scope="col">팀 골드 차이</th></tr></thead><tbody>{frames.map((frame) => {
      const row = frame.participants.find((participant) => participant.participantId === self.participantId);
      const gold = (teamId: number) => { const team = match.participants.filter((p) => p.teamId === teamId); const values = team.map((p) => frame.participants.find((participant) => p.participantId === participant.participantId)?.totalGold); return values.length && values.every((value): value is number => typeof value === "number") ? values.reduce((sum, value) => sum + value, 0) : null; };
      const ownGold = gold(self.teamId); const otherGold = otherTeams.length === 1 ? gold(otherTeams[0]) : null;
      return <tr key={frame.timestamp}><th scope="row">{matchDuration(Math.floor(frame.timestamp / 1000))}</th><td>{stat(row?.totalGold ?? null)}</td><td>{stat(row?.cs ?? null)}</td><td>{stat(row?.level ?? null)}</td><td>{stat(ownGold !== null && otherGold !== null ? ownGold - otherGold : null)}</td></tr>;
    })}</tbody></table></div></section>
    <section><h4>오브젝트 타임라인</h4><ol className={styles.events}>{objectives.map((event, index) => <li key={index}><time>{matchDuration(Math.floor(event.timestamp / 1000))}</time><span>{event.monsterType ? monsterLabels[event.monsterType] ?? event.monsterType : event.buildingType === "TOWER_BUILDING" ? "포탑" : event.buildingType === "INHIBITOR_BUILDING" ? "억제기" : "건물"}{event.killerId ? ` · 플레이어 ${event.killerId}` : ""}</span></li>)}</ol>{!objectives.length ? <p>오브젝트 이벤트가 없습니다.</p> : null}</section>
  </div>;
}

export function PlayerMatchDetail({ match: initialMatch, anonymous, playerId }: Readonly<{ match: RiotMatchDto; anonymous: boolean; playerId: string }>) {
  const [view, setView] = useState<"score" | "timeline" | "performance">("score");
  const [expanded, setExpanded] = useState(false);
  const [detailMatch, setDetailMatch] = useState<RiotMatchDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const match = detailMatch ?? initialMatch;
  useEffect(() => () => request.current?.abort(), []);
  async function loadTimeline() {
    if (!match.timelineDeferred || request.current) return;
    const controller = new AbortController(); request.current = controller; setLoading(true); setLoadFailed(false);
    try {
      const response = await fetch(`/api/riot/player/${encodeURIComponent(playerId)}/matches/${encodeURIComponent(match.matchId)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("MATCH_LOAD_FAILED");
      const result = await response.json() as { state: string; data?: RiotMatchDto | null };
      if (result.state !== "ready" || !result.data || result.data.matchId !== match.matchId || !Array.isArray(result.data.participants) || result.data.timelineDeferred) throw new Error("MATCH_LOAD_FAILED");
      setDetailMatch(result.data);
    } catch { if (!controller.signal.aborted) setLoadFailed(true); } finally { if (!controller.signal.aborted) setLoading(false); request.current = null; }
  }
  const self = selfParticipant(match);
  if (!self) return null;
  const lane10 = playerLaneSnapshot(match, 10); const lane15 = playerLaneSnapshot(match, 15);
  const kda = self.deaths === 0 && self.kills + self.assists > 0 ? "Perfect" : `${((self.kills + self.assists) / Math.max(1, self.deaths)).toFixed(2)} KDA`;
  const teamKills = match.participants.filter((row) => row.teamId === self.teamId).reduce((sum, row) => sum + row.kills, 0);
  const killParticipation = teamKills > 0 ? `${Math.round((self.kills + self.assists) / teamKills * 100)}%` : "—";
  return <details className={styles.match} data-result={match.remake ? "remake" : self.win ? "win" : "loss"} onToggle={(event) => { setExpanded(event.currentTarget.open); if (event.currentTarget.open) void loadTimeline(); }}>
    <summary className={styles.matchSummary}>
      <div className={styles.result}><strong>{match.remake ? "다시하기" : self.win ? "승리" : "패배"}</strong><span>{queueLabel(match.queueId)}</span><small>{formatKoreanDateTime(match.startedAt)} · {matchDuration(match.durationSeconds)}</small></div>
      <div className={styles.championCell}><PlayerChampion participant={self} /><span><strong>{playerChampionName(self)}</strong><small>{PLAYER_POSITION_LABELS[self.position ?? "UNKNOWN"]} · Lv.{self.champLevel ?? "—"}</small></span></div>
      <div><strong>{self.kills} / {self.deaths} / {self.assists}</strong><small>{kda} · 킬 관여 {killParticipation}</small><small>CS {stat(self.cs)} · {self.cs !== null && match.durationSeconds > 0 ? (self.cs / (match.durationSeconds / 60)).toFixed(1) : "—"}/분</small></div>
      <div><div className={styles.assets}>{self.items.map((id, i) => <PlayerAsset key={i} id={id} kind="item" />)}</div><div className={styles.assets}>{self.summonerSpells.map((id, i) => <PlayerAsset key={`s-${i}`} id={id} kind="spell" />)}{self.runes.perkIds[0] ? <PlayerAsset id={self.runes.perkIds[0]} kind="rune" /> : null}</div></div>
      <span className={styles.expandHint}>경기 상세 ▾</span>
    </summary>
    {expanded ? <div className={styles.matchBody}>
      {loading ? <p className={styles.note} role="status">이 경기의 타임라인을 불러오는 중입니다…</p> : null}
      {loadFailed ? <div role="alert" className={styles.note}>경기 타임라인을 불러오지 못했습니다. <button type="button" onClick={() => void loadTimeline()}>다시 시도</button></div> : null}
      <div className={styles.segmented} aria-label="경기 상세 보기">{([['score', '참가자 스코어보드'], ['performance', '분석 · 룬'], ['timeline', '타임라인 · 빌드']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>
      {view === "score" ? <MatchScoreboard match={match} anonymous={anonymous} /> : view === "timeline" ? <MatchTimeline match={match} /> : <div className={styles.stack}>
        <div className={styles.metricGrid}><article><span>10분 라인전</span><strong>{lane10?.gold === null || lane10?.gold === undefined ? "미수집" : `${lane10.gold > 0 ? "+" : ""}${lane10.gold} 골드`}</strong><small>상대 대비 CS {lane10?.cs ?? "—"}</small></article><article><span>15분 라인전</span><strong>{lane15?.gold === null || lane15?.gold === undefined ? "미수집" : `${lane15.gold > 0 ? "+" : ""}${lane15.gold} 골드`}</strong><small>상대 대비 CS {lane15?.cs ?? "—"} · 경험치 {lane15?.xp ?? "—"}</small></article><article><span>오브젝트 기여</span><strong>{stat(self.damageToObjectives)} 피해</strong><small>포탑 {stat(self.turretKills)} · 스틸 {stat(self.objectivesStolen)}</small></article><article><span>시야 관리</span><strong>{stat(self.visionScore)} 점수</strong><small>제어 와드 {stat(self.controlWardsBought)} · 와드 제거 {stat(self.wardsKilled)}</small></article></div>
        <section><h4>선택한 룬</h4><div className={styles.runeList}>{[self.runes.primaryStyleId, self.runes.secondaryStyleId, ...self.runes.perkIds].filter((id): id is number => id !== null && id > 0).map((id, i) => <span key={i}><PlayerAsset kind="rune" id={id} />{PLAYER_RUNES[id]?.name ?? `룬 ${id}`}</span>)}</div><p className={styles.note}>능력치 파편: {self.runes.statPerks.map((id) => ({ 5001: "체력", 5002: "방어력", 5003: "마법 저항력", 5005: "공격 속도", 5007: "스킬 가속", 5008: "적응형 능력치", 5010: "이동 속도", 5011: "체력", 5013: "강인함" } as Record<number, string>)[id] ?? `파편 ${id}`).join(" · ") || "미수집"}</p></section>
        <p className={styles.note}>멀티킬: 더블 {stat(self.doubleKills)} · 트리플 {stat(self.tripleKills)} · 쿼드라 {stat(self.quadraKills)} · 펜타 {stat(self.pentaKills)}. 패치 {match.gameVersion} · 경기 {match.matchId}</p>
      </div>}
    </div> : null}
  </details>;
}
