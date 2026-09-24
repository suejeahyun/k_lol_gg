import { findDataDragonChampion } from "@/modules/champions/domain/champion-image";
import type { RiotMatchDto, RiotMatchParticipantDto, RiotRankHistoryDto } from "@/modules/riot/domain/riot-player-analytics";
import { summarizeRiotTimeline } from "@/modules/riot/domain/riot-player-analytics";

export const PLAYER_POSITION_LABELS = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터", UNKNOWN: "미분류" } as const;
export type PlayerMatchFilters = Readonly<{ year: string; queue: string; patch: string; position: string; champion: string; result: string; from: string; to: string; sort: string }>;
export const DEFAULT_PLAYER_MATCH_FILTERS: PlayerMatchFilters = { year: "ALL", queue: "ALL", patch: "ALL", position: "ALL", champion: "ALL", result: "ALL", from: "", to: "", sort: "recent" };
export function selfParticipant(match: RiotMatchDto) { return match.participants.find((row) => row.participantId === match.selfParticipantId) ?? null; }
export function playerChampionName(row: Pick<RiotMatchParticipantDto, "championId" | "championName">) { return findDataDragonChampion(String(row.championId), row.championName)?.name ?? row.championName; }
export function koreanMatchDate(value: string) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
export function matchPatch(match: RiotMatchDto) { return match.gameVersion.split(".").slice(0, 2).join("."); }
export function queueLabel(id: number) { return ({ 420: "솔로 랭크", 440: "자유 랭크", 450: "칼바람", 400: "일반 교차", 430: "일반", 490: "빠른 대전", 700: "격전", 1700: "아레나", 1710: "아레나", 1900: "URF", 2300: "난투", 2400: "칼바람: 아수라장" } as Record<number, string>)[id] ?? `게임 모드 ${id}`; }
export function roundPlayerStat(value: number) { return Math.round(value * 100) / 100; }
export function playerKda(row: Pick<RiotMatchParticipantDto, "kills" | "deaths" | "assists">) { return (row.kills + row.assists) / Math.max(1, row.deaths); }
export function filterPlayerMatches(matches: readonly RiotMatchDto[], filters: PlayerMatchFilters): RiotMatchDto[] {
  const selected = matches.filter((match) => {
    const self = selfParticipant(match);
    if (!self) return false;
    const date = koreanMatchDate(match.startedAt);
    return (filters.year === "ALL" || date.startsWith(filters.year)) && (filters.queue === "ALL" || String(match.queueId) === filters.queue)
      && (filters.patch === "ALL" || filters.patch.split(",").includes(matchPatch(match))) && (filters.position === "ALL" || (self.position ?? "UNKNOWN") === filters.position)
      && (filters.champion === "ALL" || String(self.championId) === filters.champion)
      && (filters.result === "ALL" || (filters.result === "remake" ? match.remake : !match.remake && self.win === (filters.result === "win")))
      && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  });
  return selected.sort((a, b) => {
    const left = selfParticipant(a)!; const right = selfParticipant(b)!;
    if (filters.sort === "oldest") return a.startedAt.localeCompare(b.startedAt);
    if (filters.sort === "kda") return playerKda(right) - playerKda(left) || b.startedAt.localeCompare(a.startedAt);
    if (filters.sort === "damage") return (right.damageToChampions ?? -1) - (left.damageToChampions ?? -1) || b.startedAt.localeCompare(a.startedAt);
    return b.startedAt.localeCompare(a.startedAt);
  });
}

export type PlayerAggregate = Readonly<{ games: number; wins: number; losses: number; winRate: number; kills: number; deaths: number; assists: number; kda: number; perfect: boolean; csPerMinute: number | null; damagePerMinute: number | null; visionPerMinute: number | null; killParticipation: number | null; averageGold: number | null; averageDamage: number | null; averageVisionScore: number | null; averageTurretPlates: number | null; turretPlateGames: number; averageDuration: number }>;
export function aggregatePlayerMatches(matches: readonly RiotMatchDto[]): PlayerAggregate {
  const valid = matches.filter((match) => !match.remake && selfParticipant(match));
  const sums = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, duration: 0 };
  const averages = { cs: { total: 0, count: 0 }, damage: { total: 0, count: 0 }, vision: { total: 0, count: 0 }, kp: { total: 0, count: 0 }, goldTotal: { total: 0, count: 0 }, damageTotal: { total: 0, count: 0 }, visionTotal: { total: 0, count: 0 }, turretPlates: { total: 0, count: 0 } };
  function add(key: keyof typeof averages, value: number | null) { if (value !== null) { averages[key].total += value; averages[key].count++; } }
  for (const match of valid) {
    const self = selfParticipant(match)!;
    const teamKills = match.participants.filter((row) => row.teamId === self.teamId).reduce((sum, row) => sum + row.kills, 0);
    const minutes = match.durationSeconds / 60;
    sums.games++; sums.wins += Number(self.win); sums.kills += self.kills; sums.deaths += self.deaths; sums.assists += self.assists; sums.duration += match.durationSeconds;
    add("cs", self.cs !== null && minutes > 0 ? self.cs / minutes : null);
    add("damage", self.damageToChampions !== null && minutes > 0 ? self.damageToChampions / minutes : null);
    add("vision", self.visionScore !== null && minutes > 0 ? self.visionScore / minutes : null);
    add("kp", teamKills > 0 ? Math.min(100, (self.kills + self.assists) / teamKills * 100) : null);
    add("goldTotal", self.goldEarned); add("damageTotal", self.damageToChampions); add("visionTotal", self.visionScore);
    add("turretPlates", self.turretPlatesTaken ?? null);
  }
  const average = (key: keyof typeof averages) => averages[key].count ? roundPlayerStat(averages[key].total / averages[key].count) : null;
  return { games: sums.games, wins: sums.wins, losses: sums.games - sums.wins, winRate: sums.games ? roundPlayerStat(sums.wins / sums.games * 100) : 0,
    kills: sums.games ? roundPlayerStat(sums.kills / sums.games) : 0, deaths: sums.games ? roundPlayerStat(sums.deaths / sums.games) : 0, assists: sums.games ? roundPlayerStat(sums.assists / sums.games) : 0,
    kda: roundPlayerStat((sums.kills + sums.assists) / Math.max(1, sums.deaths)), perfect: sums.kills + sums.assists > 0 && sums.deaths === 0, csPerMinute: average("cs"), damagePerMinute: average("damage"), visionPerMinute: average("vision"), killParticipation: average("kp"), averageGold: average("goldTotal"), averageDamage: average("damageTotal"), averageVisionScore: average("visionTotal"), averageTurretPlates: average("turretPlates"), turretPlateGames: averages.turretPlates.count, averageDuration: sums.games ? Math.round(sums.duration / sums.games) : 0 };
}

export function playerChampionAggregates(matches: readonly RiotMatchDto[]) {
  const groups = new Map<number, RiotMatchDto[]>();
  for (const match of matches) { const self = selfParticipant(match); if (self && !match.remake) groups.set(self.championId, [...(groups.get(self.championId) ?? []), match]); }
  return [...groups].map(([championId, games]) => ({ championId, championName: playerChampionName(selfParticipant(games[0])!), ...aggregatePlayerMatches(games) }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.championId - b.championId);
}
export function playerPositionAggregates(matches: readonly RiotMatchDto[]) {
  const total = matches.filter((match) => !match.remake && selfParticipant(match)).length;
  return Object.entries(PLAYER_POSITION_LABELS).map(([position, label]) => {
    const aggregate = aggregatePlayerMatches(matches.filter((match) => (selfParticipant(match)?.position ?? "UNKNOWN") === position));
    return { position, label, ...aggregate, share: total ? roundPlayerStat(aggregate.games / total * 100) : 0 };
  });
}
export function playerDailyAggregates(matches: readonly RiotMatchDto[]) {
  const groups = new Map<string, RiotMatchDto[]>();
  for (const match of matches) { if (match.remake) continue; const date = koreanMatchDate(match.startedAt); groups.set(date, [...(groups.get(date) ?? []), match]); }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, games]) => ({ date, ...aggregatePlayerMatches(games) }));
}
export function playerRankPoints(row: RiotRankHistoryDto): number | null {
  const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const tier = row.tier?.toUpperCase(); const index = tier ? tiers.indexOf(tier) : -1;
  if (index < 0 || row.leaguePoints === null) return null;
  if (index >= 7) return 2800 + row.leaguePoints;
  const division = ["IV", "III", "II", "I"].indexOf(row.rank ?? "");
  return division >= 0 ? index * 400 + division * 100 + row.leaguePoints : null;
}
export function playerEncounters(matches: readonly RiotMatchDto[], kind: "ally" | "enemy" | "opponent") {
  const groups = new Map<string, { label: string; championId: number | null; games: number; wins: number; laneGames: number; goldDelta: number }>();
  for (const match of matches) {
    const self = selfParticipant(match); if (!self || match.remake) continue;
    const candidates = match.participants.filter((row) => row.participantId !== self.participantId && (kind === "opponent" ? self.position && row.position === self.position && row.teamId !== self.teamId : row.riotId && (kind === "ally" ? row.teamId === self.teamId : row.teamId !== self.teamId)));
    for (const row of candidates) {
      const key = kind === "opponent" ? String(row.championId) : row.riotId!;
      const previous = groups.get(key) ?? { label: kind === "opponent" ? playerChampionName(row) : row.riotId!, championId: kind === "opponent" ? row.championId : null, games: 0, wins: 0, laneGames: 0, goldDelta: 0 };
      const laneGold = kind === "opponent" ? playerLaneSnapshot(match, 15)?.gold ?? null : null;
      groups.set(key, { ...previous, games: previous.games + 1, wins: previous.wins + Number(self.win), laneGames: previous.laneGames + Number(laneGold !== null), goldDelta: previous.goldDelta + (laneGold ?? 0) });
    }
  }
  return [...groups.values()].map((row) => ({ ...row, winRate: roundPlayerStat(row.wins / row.games * 100), goldDiffAt15: row.laneGames ? roundPlayerStat(row.goldDelta / row.laneGames) : null })).sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.label.localeCompare(b.label));
}
export function playerBuildAggregates(matches: readonly RiotMatchDto[], kind: "items" | "runes" | "spells") {
  const groups = new Map<string, { ids: readonly number[]; games: number; wins: number; queueId: number; mapId: number }>();
  const samples = new Map<string, number>();
  for (const match of matches) {
    const self = selfParticipant(match); if (!self || match.remake) continue;
    const mode = `${match.queueId}:${match.mapId}`; samples.set(mode, (samples.get(mode) ?? 0) + 1);
    const ids = (kind === "items" ? self.items.slice(0, 6) : kind === "runes" ? self.runes.perkIds : self.summonerSpells).filter((id) => id > 0);
    if (!ids.length) continue;
    const key = `${mode}:${[...ids].sort((a, b) => a - b).join("-")}`;
    const previous = groups.get(key) ?? { ids, games: 0, wins: 0, queueId: match.queueId, mapId: match.mapId };
    groups.set(key, { ...previous, games: previous.games + 1, wins: previous.wins + Number(self.win) });
  }
  return [...groups.values()].map((row) => ({ ...row, eligibleGames: samples.get(`${row.queueId}:${row.mapId}`) ?? 0, winRate: roundPlayerStat(row.wins / row.games * 100) })).sort((a, b) => b.games - a.games || b.winRate - a.winRate);
}

export function playerLaneSnapshot(match: RiotMatchDto, minute: 10 | 15) {
  if (match.durationSeconds < minute * 60) return null;
  const summary = match.timelineSummary ?? summarizeRiotTimeline(match);
  const row = minute === 10 ? { gold: summary.goldDiffAt10, cs: summary.csDiffAt10, xp: null } : { gold: summary.goldDiffAt15, cs: summary.csDiffAt15, xp: summary.xpDiffAt15 };
  return Object.values(row).every((value) => value === null) ? null : row;
}
export function playerReportMetrics(matches: readonly RiotMatchDto[]) {
  const valid = matches.filter((match) => !match.remake && selfParticipant(match));
  const rows: { id: string; label: string; unit: string; formula: string; values: number[] }[] = [
    { id: "growth", label: "성장", unit: "골드/분", formula: "각 경기 획득 골드 ÷ 경기 시간(분)의 평균", values: [] },
    { id: "combat", label: "교전", unit: "% 킬 관여", formula: "(킬 + 어시스트) ÷ 아군 총 킬 × 100의 경기별 평균", values: [] },
    { id: "objective", label: "오브젝트", unit: "피해량/분", formula: "각 경기 오브젝트 피해량 ÷ 경기 시간(분)의 평균", values: [] },
    { id: "vision", label: "시야", unit: "시야 점수/분", formula: "각 경기 시야 점수 ÷ 경기 시간(분)의 평균", values: [] },
    { id: "lane", label: "라인전", unit: "골드 차이(15분)", formula: "15분 타임라인의 본인 골드 − 동일 포지션 상대 골드의 평균", values: [] },
    { id: "roam", label: "초반 합류", unit: "킬 관여(15분)", formula: "첫 15분 타임라인에서 킬 또는 어시스트로 참여한 교전 수의 평균. 이동 경로에 따른 로밍 판정은 포함하지 않습니다.", values: [] },
  ];
  for (const match of valid) {
    const self = selfParticipant(match)!; const minutes = match.durationSeconds / 60;
    const teamKills = match.participants.filter((row) => row.teamId === self.teamId).reduce((sum, row) => sum + row.kills, 0);
    if (minutes > 0 && self.goldEarned !== null) rows[0].values.push(self.goldEarned / minutes);
    if (teamKills > 0) rows[1].values.push(Math.min(100, (self.kills + self.assists) / teamKills * 100));
    if (minutes > 0 && self.damageToObjectives !== null) rows[2].values.push(self.damageToObjectives / minutes);
    if (minutes > 0 && self.visionScore !== null) rows[3].values.push(self.visionScore / minutes);
    const lane = playerLaneSnapshot(match, 15); if (lane?.gold !== null && lane?.gold !== undefined) rows[4].values.push(lane.gold);
    const earlyTakedowns = (match.timelineSummary ?? summarizeRiotTimeline(match)).earlyTakedowns;
    if (earlyTakedowns !== null && match.durationSeconds >= 900) rows[5].values.push(earlyTakedowns);
  }
  return rows.map(({ values, ...row }) => ({ ...row, games: values.length, value: values.length ? roundPlayerStat(values.reduce((sum, value) => sum + value, 0) / values.length) : null }));
}
