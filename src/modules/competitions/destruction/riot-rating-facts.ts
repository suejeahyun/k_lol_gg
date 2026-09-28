import { AramSyncError } from "./aram-rating";
import { boundedRatingScore, championBreadthScore, soloRatingScore, type RatingComponent } from "./provisional-rating";
import { RiotAramRecords } from "./riot-aram-records";

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export function noRatingData(evidence: string, now: string, source: RatingComponent["source"] = "RIOT"): RatingComponent { return { score: null, status: "NO_DATA", source, evidence, samples: 0, observedAt: now }; }

export class RiotRatingFacts {
  constructor(private readonly api: RiotAramRecords, private readonly platformBaseUrl: string) {}

  async solo(puuid: string, now: string): Promise<RatingComponent> {
    const rows = await this.api.json(`/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, this.platformBaseUrl);
    if (!Array.isArray(rows) || rows.length > 32 || rows.some((row) => !object(row))) throw new AramSyncError("INVALID_RESPONSE");
    const entry = rows.find((row) => row.queueType === "RANKED_SOLO_5x5");
    if (!entry) return noRatingData("현재 솔랭 미배치 · 과거 기록 별도 확인 필요", now);
    const score = soloRatingScore(entry.tier, entry.rank, entry.leaguePoints);
    if (score === null || !count(entry.wins) || !count(entry.losses)) throw new AramSyncError("INVALID_RESPONSE");
    return { score, status: "READY", source: "RIOT", evidence: `${entry.tier} ${entry.rank} ${entry.leaguePoints}LP · 절대 티어 구간`, samples: entry.wins + entry.losses, observedAt: now };
  }

  async champions(puuid: string, now: string): Promise<RatingComponent> {
    const rows = await this.api.json(`/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}`, this.platformBaseUrl);
    if (!Array.isArray(rows) || rows.length > 500 || rows.some((row) => !object(row) || !count(row.championId) || !count(row.championPoints) || !count(row.lastPlayTime)) || new Set(rows.map((row) => row.championId)).size !== rows.length) throw new AramSyncError("INVALID_RESPONSE");
    const result = championBreadthScore(rows, Date.parse(now));
    return { score: result.score, status: "READY", source: "RIOT", samples: result.samples, observedAt: now,
      evidence: `최근 180일 플레이 챔피언 ${result.samples}명 · 숙련도 1만 이상 ${result.experienced}명 · 폭 70%·편중도 30% (누적 숙련도, 모드 구분 없음)` };
  }

  async challenges(puuid: string, now: string): Promise<RatingComponent> {
    const configs = await this.api.json("/lol/challenges/v1/challenges/config", this.platformBaseUrl);
    // Exact names and lifetime scope avoid accidentally summing unrelated, retired or seasonal challenges.
    if (!Array.isArray(configs) || configs.length > 5000) throw new AramSyncError("INVALID_RESPONSE");
    const names = ["All Random All Champions", "All Random All Flawless", "NA-RAM"];
    const selected = configs.flatMap((raw) => {
      const cfg = object(raw); const text = object(object(cfg?.localizedNames)?.en_US);
      const master = object(cfg?.thresholds)?.MASTER;
      return cfg && cfg.state === "ENABLED" && cfg.tracking === "LIFETIME" && names.includes(String(text?.name)) && count(cfg.id) && typeof master === "number" && Number.isFinite(master) && master > 0
        ? [{ id: cfg.id, name: String(text?.name), target: master }] : [];
    });
    if (selected.length !== names.length || new Set(selected.map((item) => item.name)).size !== names.length) return noRatingData("칼바람 도전과제 정의·집계 범위를 확인하지 못함", now);
    const data = object(await this.api.json(`/lol/challenges/v1/player-data/${encodeURIComponent(puuid)}`, this.platformBaseUrl));
    if (!Array.isArray(data?.challenges)) throw new AramSyncError("INVALID_RESPONSE");
    const values = selected.map((cfg) => {
      const rows = data.challenges as unknown[];
      const entry = rows.map(object).filter((item) => item?.challengeId === cfg.id);
      // Missing entry isn't assumed to mean zero progress.
      if (entry.length !== 1 || typeof entry[0]?.value !== "number" || !Number.isFinite(entry[0].value) || entry[0].value < 0) return null;
      return { ...cfg, value: entry[0].value };
    });
    if (values.some((value) => value === null)) return noRatingData("일부 칼바람 도전과제 진행값 미제공", now);
    const found = values.filter((value) => value !== null);
    return { score: boundedRatingScore(found.reduce((total, item) => total + Math.min(item.value / item.target, 1) * 100, 0) / found.length), status: "READY", source: "RIOT", samples: found.length, observedAt: now,
      evidence: found.map((item) => `${item.name}(${item.id}) ${item.value}/${item.target}`).join(" · ") + " · 누적 성취, 증바람 판수 아님" };
  }
}
