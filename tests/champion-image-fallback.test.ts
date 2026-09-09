import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_DRAGON_CATALOG_SOURCE,
  DATA_DRAGON_CHAMPIONS,
  DATA_DRAGON_EXPECTED_CHAMPION_COUNT,
  DATA_DRAGON_VERSION,
} from "../src/modules/champions/domain/data-dragon-catalog";
import {
  championImageCandidates,
  findDataDragonChampion,
  officialChampionImageUrl,
  officialChampionSplashUrl,
  resolveChampionImageUrl,
} from "../src/modules/champions/domain/champion-image";

test("pinned Data Dragon catalog contains 173 unique official champions", () => {
  assert.equal(DATA_DRAGON_VERSION, "16.17.1");
  assert.equal(DATA_DRAGON_CATALOG_SOURCE, "https://ddragon.leagueoflegends.com/cdn/16.17.1/data/ko_KR/champion.json");
  assert.equal(DATA_DRAGON_CHAMPIONS.length, DATA_DRAGON_EXPECTED_CHAMPION_COUNT);
  assert.equal(new Set(DATA_DRAGON_CHAMPIONS.map((champion) => champion.riotKey)).size, 173);
  assert.equal(new Set(DATA_DRAGON_CHAMPIONS.map((champion) => champion.id)).size, 173);
  assert.equal(new Set(DATA_DRAGON_CHAMPIONS.map((champion) => champion.name)).size, 173);
});

test("home splash chain keeps high-resolution artwork ahead of icon and stored fallback", () => {
  const stored = "https://ddragon.leagueoflegends.com/cdn/15.24.1/img/champion/Kindred.png";
  assert.equal(
    officialChampionSplashUrl("kindred"),
    "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kindred_0.jpg",
  );
  assert.deepEqual(championImageCandidates(stored, "kindred", "킨드레드", "splash"), [
    "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kindred_0.jpg",
    "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Kindred.png",
    stored,
  ]);
});

test("resolver uses official ids for canonical, legacy, numeric and Korean lookups", () => {
  assert.equal(officialChampionImageUrl("ahri"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Ahri.png");
  assert.equal(resolveChampionImageUrl(null, "drmundo"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/DrMundo.png");
  assert.equal(officialChampionImageUrl("888"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Renata.png");
  assert.equal(officialChampionImageUrl("renataglasc"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Renata.png");
  assert.equal(officialChampionImageUrl("wukong"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/MonkeyKing.png");
  assert.equal(resolveChampionImageUrl(null, "v1-103", "아리"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Ahri.png");
  assert.equal(findDataDragonChampion("v1-unknown", "로크")?.id, "Locke");
  assert.equal(officialChampionImageUrl("ahri/../../secret"), null);
  assert.equal(officialChampionImageUrl("not-a-real-champion"), null);
});

test("all generated portrait URLs use the pinned official version", () => {
  const generated = DATA_DRAGON_CHAMPIONS.map((champion) => officialChampionImageUrl(champion.id));
  assert.equal(generated.length, 173);
  assert.equal(generated.every((url) => url?.includes("/cdn/16.17.1/img/champion/")), true);
});

test("candidate chain prefers official identity, then validated stored URL, then text fallback", () => {
  const stored = "https://ddragon.leagueoflegends.com/cdn/15.24.1/img/champion/Ahri.png";
  assert.deepEqual(championImageCandidates(stored, "ahri", "아리"), [
    "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Ahri.png",
    stored,
  ]);
  assert.deepEqual(championImageCandidates(stored, "unknown", "알 수 없음"), [stored]);
  assert.deepEqual(championImageCandidates("https://example.invalid/Ahri.png", "unknown", "알 수 없음"), []);
  assert.equal(resolveChampionImageUrl(stored, "ahri", "아리"), "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Ahri.png");
});
