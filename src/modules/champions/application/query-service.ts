import { canonicalChampionKey, toPublicChampionDto, type Champion, type ChampionStatus, type PublicChampionDto } from "../domain/champion";

export type ChampionListQuery = Readonly<{
  query: string | null;
  status: ChampionStatus | null;
  page: number;
  pageSize: number;
}>;

export type ChampionListPage<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type AdminChampionDto = Readonly<{
  key: string;
  displayName: string;
  status: ChampionStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export interface ChampionQueryRepository {
  list(query: ChampionListQuery): Promise<ChampionListPage<Champion>>;
  find(key: string): Promise<Champion | null>;
}

function singleton(params: URLSearchParams, key: string) {
  const values = params.getAll(key);
  return values.length <= 1 ? values[0] ?? null : undefined;
}

export function parseChampionListQuery(url: string, admin: boolean): ChampionListQuery | null {
  const params = new URL(url).searchParams;
  const allowed = new Set(admin ? ["q", "status", "page", "pageSize"] : ["q", "page", "pageSize"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return null;
  const rawQuery = singleton(params, "q");
  const rawStatus = singleton(params, "status");
  const rawPage = singleton(params, "page");
  const rawPageSize = singleton(params, "pageSize");
  if ([rawQuery, rawStatus, rawPage, rawPageSize].includes(undefined)) return null;
  const query = rawQuery?.normalize("NFKC").trim().replace(/\s+/gu, " ") || null;
  if (query && (query.length > 80 || /[\u0000-\u001f\u007f]/u.test(query))) return null;
  if (rawStatus !== null && rawStatus !== "" && rawStatus !== "ACTIVE" && rawStatus !== "INACTIVE") return null;
  const pageText = rawPage || "1";
  const pageSizeText = rawPageSize || "30";
  if (!/^[1-9][0-9]{0,3}$/u.test(pageText) || !/^[1-9][0-9]{0,2}$/u.test(pageSizeText)) return null;
  const page = Number(pageText);
  const pageSize = Number(pageSizeText);
  if (page > 1_000 || pageSize > 100) return null;
  return Object.freeze({
    query,
    status: admin ? ((rawStatus || null) as ChampionStatus | null) : "ACTIVE",
    page,
    pageSize,
  });
}

function toAdminDto(champion: Champion): AdminChampionDto {
  return Object.freeze({
    key: champion.key,
    displayName: champion.displayName,
    status: champion.status,
    revision: champion.revision,
    createdAt: champion.createdAt.toISOString(),
    updatedAt: champion.updatedAt.toISOString(),
  });
}

export class ChampionQueryService {
  constructor(private readonly repository: ChampionQueryRepository) {}

  async listPublic(query: ChampionListQuery): Promise<ChampionListPage<PublicChampionDto>> {
    const page = await this.repository.list({ ...query, status: "ACTIVE" });
    return Object.freeze({ ...page, items: Object.freeze(page.items.map(toPublicChampionDto)) });
  }

  async getPublic(key: string): Promise<PublicChampionDto | null> {
    const champion = await this.repository.find(canonicalChampionKey(key));
    return champion?.status === "ACTIVE" ? toPublicChampionDto(champion) : null;
  }

  async listAdmin(query: ChampionListQuery): Promise<ChampionListPage<AdminChampionDto>> {
    const page = await this.repository.list(query);
    return Object.freeze({ ...page, items: Object.freeze(page.items.map(toAdminDto)) });
  }

  async getAdmin(key: string): Promise<AdminChampionDto | null> {
    const champion = await this.repository.find(canonicalChampionKey(key));
    return champion ? toAdminDto(champion) : null;
  }
}
