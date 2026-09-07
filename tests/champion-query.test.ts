import assert from "node:assert/strict";
import test from "node:test";

import { ChampionQueryService, parseChampionListQuery, type Champion, type ChampionQueryRepository } from "../src/modules/champions";

const rows: Champion[] = [
  { key: "ahri", displayName: "아리", status: "ACTIVE", revision: 2, createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-02-01T00:00:00.000Z") },
  { key: "old", displayName: "비활성", status: "INACTIVE", revision: 1, createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-02-01T00:00:00.000Z") },
];

class Repository implements ChampionQueryRepository {
  lastStatus: string | null = null;
  async list(query: Parameters<ChampionQueryRepository["list"]>[0]) {
    this.lastStatus = query.status;
    const items = query.status ? rows.filter((row) => row.status === query.status) : rows;
    return { items, page: query.page, pageSize: query.pageSize, total: items.length };
  }
  async find(key: string) { return rows.find((row) => row.key === key) ?? null; }
}

test("champion list query is strict, bounded, and public status cannot be overridden", async () => {
  const publicQuery = parseChampionListQuery("https://v2.invalid/api/champions?q=%20아리%20&page=1&pageSize=30", false);
  assert.deepEqual(publicQuery, { query: "아리", status: "ACTIVE", page: 1, pageSize: 30 });
  assert.equal(parseChampionListQuery("https://v2.invalid/api/champions?status=INACTIVE", false), null);
  assert.equal(parseChampionListQuery("https://v2.invalid/api/champions?pageSize=101", false), null);
  assert.equal(parseChampionListQuery("https://v2.invalid/api/champions?q=a&q=b", false), null);
  assert.equal(parseChampionListQuery("https://v2.invalid/api/champions?unknown=1", false), null);

  const repository = new Repository();
  const page = await new ChampionQueryService(repository).listPublic(publicQuery!);
  assert.equal(repository.lastStatus, "ACTIVE");
  assert.deepEqual(page.items, [{ key: "ahri", displayName: "아리" }]);
});

test("admin DTO exposes revision and status but no hidden account or storage fields", async () => {
  const repository = new Repository();
  const query = parseChampionListQuery("https://v2.invalid/api/admin/champions?status=INACTIVE", true)!;
  const page = await new ChampionQueryService(repository).listAdmin(query);
  assert.equal(page.items[0]?.status, "INACTIVE");
  assert.deepEqual(Object.keys(page.items[0]!).sort(), ["createdAt", "displayName", "key", "revision", "status", "updatedAt"]);
});
