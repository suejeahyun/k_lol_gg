import assert from "node:assert/strict";
import test from "node:test";

import { officialChampionImageUrl, resolveChampionImageUrl } from "../src/modules/champions/domain/champion-image";

test("null champion image uses only the official Data Dragon key fallback", () => {
  assert.equal(officialChampionImageUrl("ahri"), "https://ddragon.leagueoflegends.com/cdn/26.18.1/img/champion/Ahri.png");
  assert.equal(resolveChampionImageUrl(null, "drmundo"), "https://ddragon.leagueoflegends.com/cdn/26.18.1/img/champion/DrMundo.png");
  assert.equal(officialChampionImageUrl("ahri/../../secret"), null);
});
