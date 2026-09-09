import {
  DATA_DRAGON_CHAMPIONS,
  DATA_DRAGON_EXPECTED_CHAMPION_COUNT,
  DATA_DRAGON_VERSION,
} from "./data-dragon-catalog";
import {
  findDataDragonChampion,
  normalizeChampionImageUrl,
  officialChampionImageUrl,
} from "./champion-image";

export type ChampionImageRow = Readonly<{
  key: string;
  displayName: string;
  imageUrl: string | null;
}>;

export type ChampionImageBackfillStep = Readonly<{
  key: string;
  displayName: string;
  currentImageUrl: string | null;
  expectedImageUrl: string | null;
  officialChampionId: string | null;
  action: "UPDATE" | "UNCHANGED" | "UNMATCHED" | "CONFLICT";
  reason: string;
}>;

export type ChampionImageBackfillPlan = Readonly<{
  dataDragonVersion: string;
  datasetRows: number;
  databaseRows: number;
  matchedRows: number;
  wouldUpdateRows: number;
  alreadyCorrectRows: number;
  unmatchedRows: number;
  conflictRows: number;
  steps: readonly ChampionImageBackfillStep[];
}>;

export function planChampionImageBackfill(
  rows: readonly ChampionImageRow[],
): ChampionImageBackfillPlan {
  const candidates = rows.map((row) => ({
    row,
    official: findDataDragonChampion(row.key, row.displayName),
  }));
  const officialIdCounts = new Map<string, number>();

  for (const candidate of candidates) {
    if (!candidate.official) continue;
    officialIdCounts.set(
      candidate.official.id,
      (officialIdCounts.get(candidate.official.id) ?? 0) + 1,
    );
  }

  const steps = candidates.map<ChampionImageBackfillStep>(({ row, official }) => {
    if (!official) {
      return {
        key: row.key,
        displayName: row.displayName,
        currentImageUrl: row.imageUrl,
        expectedImageUrl: null,
        officialChampionId: null,
        action: "UNMATCHED",
        reason: "공식 16.17.1 카탈로그에서 키 또는 표시 이름을 찾지 못했습니다.",
      };
    }

    const expectedImageUrl = officialChampionImageUrl(official.id);
    if (!expectedImageUrl) throw new Error("OFFICIAL_CHAMPION_IMAGE_URL_MISSING");
    if ((officialIdCounts.get(official.id) ?? 0) > 1) {
      return {
        key: row.key,
        displayName: row.displayName,
        currentImageUrl: row.imageUrl,
        expectedImageUrl,
        officialChampionId: official.id,
        action: "CONFLICT",
        reason: "두 개 이상의 DB 행이 같은 공식 챔피언으로 매핑됩니다.",
      };
    }
    if (normalizeChampionImageUrl(row.imageUrl) === expectedImageUrl) {
      return {
        key: row.key,
        displayName: row.displayName,
        currentImageUrl: row.imageUrl,
        expectedImageUrl,
        officialChampionId: official.id,
        action: "UNCHANGED",
        reason: "이미 고정된 공식 URL과 일치합니다.",
      };
    }
    return {
      key: row.key,
      displayName: row.displayName,
      currentImageUrl: row.imageUrl,
      expectedImageUrl,
      officialChampionId: official.id,
      action: "UPDATE",
      reason: row.imageUrl === null
        ? "비어 있는 이미지 URL을 공식 URL로 채웁니다."
        : "이전 Data Dragon URL을 고정 버전 URL로 교체합니다.",
    };
  });

  const count = (action: ChampionImageBackfillStep["action"]) =>
    steps.filter((step) => step.action === action).length;
  const wouldUpdateRows = count("UPDATE");
  const alreadyCorrectRows = count("UNCHANGED");

  return Object.freeze({
    dataDragonVersion: DATA_DRAGON_VERSION,
    datasetRows: DATA_DRAGON_CHAMPIONS.length,
    databaseRows: rows.length,
    matchedRows: wouldUpdateRows + alreadyCorrectRows,
    wouldUpdateRows,
    alreadyCorrectRows,
    unmatchedRows: count("UNMATCHED"),
    conflictRows: count("CONFLICT"),
    steps: Object.freeze(steps),
  });
}

export function assertChampionImageBackfillReady(
  plan: ChampionImageBackfillPlan,
  expectedDatabaseRows = DATA_DRAGON_EXPECTED_CHAMPION_COUNT,
): void {
  if (plan.datasetRows !== DATA_DRAGON_EXPECTED_CHAMPION_COUNT) {
    throw new Error("DATA_DRAGON_CATALOG_COUNT_MISMATCH:" + plan.datasetRows);
  }
  if (plan.databaseRows !== expectedDatabaseRows) {
    throw new Error("CHAMPION_DATABASE_COUNT_MISMATCH:" + plan.databaseRows);
  }
  if (plan.unmatchedRows !== 0) {
    throw new Error("CHAMPION_IMAGE_UNMATCHED_ROWS:" + plan.unmatchedRows);
  }
  if (plan.conflictRows !== 0) {
    throw new Error("CHAMPION_IMAGE_CONFLICT_ROWS:" + plan.conflictRows);
  }
  if (plan.matchedRows !== expectedDatabaseRows) {
    throw new Error("CHAMPION_IMAGE_MATCHED_COUNT_MISMATCH:" + plan.matchedRows);
  }
}

export function createChampionImageBackfillFixture(): readonly ChampionImageRow[] {
  return Object.freeze(DATA_DRAGON_CHAMPIONS.map((champion, index) => Object.freeze({
    key: "v1-" + (index + 1),
    displayName: champion.name,
    imageUrl: null,
  })));
}
