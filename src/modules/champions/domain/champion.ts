export type ChampionStatus = "ACTIVE" | "INACTIVE";

export type Champion = Readonly<{
  key: string;
  displayName: string;
  imageUrl: string | null;
  status: ChampionStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export function canonicalChampionKey(value: string): string {
  const key = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(key)) throw new Error("INVALID_CHAMPION_KEY");
  return key;
}

export function canonicalChampionDisplayName(value: string): string {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error("INVALID_CHAMPION_DISPLAY_NAME");
  }
  return name;
}

export function createChampion(input: Readonly<{
  key: string;
  displayName: string;
  now: Date;
}>): Champion {
  if (!Number.isFinite(input.now.getTime())) throw new Error("INVALID_CHAMPION_TIME");
  return Object.freeze({
    key: canonicalChampionKey(input.key),
    displayName: canonicalChampionDisplayName(input.displayName),
    imageUrl: null,
    status: "ACTIVE",
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function updateChampion(input: Readonly<{
  current: Champion;
  expectedRevision: number;
  displayName?: string;
  status?: ChampionStatus;
  now: Date;
}>): Champion {
  if (!Number.isSafeInteger(input.expectedRevision) || input.current.revision !== input.expectedRevision) {
    throw new Error("STALE_CHAMPION_REVISION");
  }
  if (!Number.isFinite(input.now.getTime()) || input.now.getTime() < input.current.updatedAt.getTime()) {
    throw new Error("INVALID_CHAMPION_TIME");
  }
  if (input.displayName === undefined && input.status === undefined) throw new Error("EMPTY_CHAMPION_PATCH");
  if (input.status !== undefined && input.status !== "ACTIVE" && input.status !== "INACTIVE") {
    throw new Error("INVALID_CHAMPION_STATUS");
  }
  return Object.freeze({
    ...input.current,
    displayName: input.displayName === undefined
      ? input.current.displayName
      : canonicalChampionDisplayName(input.displayName),
    status: input.status ?? input.current.status,
    revision: input.current.revision + 1,
    updatedAt: input.now,
  });
}

/** Referenced champions are retained for historic match/stat snapshots. */
export function deactivateChampion(input: Readonly<{
  current: Champion;
  expectedRevision: number;
  now: Date;
}>): Champion {
  if (input.current.status === "INACTIVE") {
    if (input.current.revision !== input.expectedRevision) throw new Error("STALE_CHAMPION_REVISION");
    return input.current;
  }
  return updateChampion({ ...input, status: "INACTIVE" });
}

export type PublicChampionDto = Readonly<{
  key: string;
  displayName: string;
  imageUrl: string | null;
}>;

export function toPublicChampionDto(champion: Champion): PublicChampionDto {
  if (champion.status !== "ACTIVE") throw new Error("CHAMPION_NOT_FOUND");
  return Object.freeze({ key: champion.key, displayName: champion.displayName, imageUrl: champion.imageUrl });
}
