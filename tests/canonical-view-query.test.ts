import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseCanonicalViewQuery } from "../src/modules/navigation/application/canonical-view-query";

test("canonical selector parser preserves one reviewed value", () => {
  assert.deepEqual(parseCanonicalViewQuery({ tab: "player" }, { tab: ["player"] }), {
    ok: true,
    values: { tab: "player" },
  });
  assert.deepEqual(parseCanonicalViewQuery({}, { tab: ["player"] }), { ok: true, values: {} });
});

test("canonical selector parser rejects duplicates, unknown keys, and unreviewed values", () => {
  assert.deepEqual(parseCanonicalViewQuery({ tab: ["player", "player"] }, { tab: ["player"] }), { ok: false });
  assert.deepEqual(parseCanonicalViewQuery({ next: "//outside.example" }, { tab: ["player"] }), { ok: false });
  assert.deepEqual(parseCanonicalViewQuery({ toString: "player" }, { tab: ["player"] }), { ok: false });
  assert.deepEqual(parseCanonicalViewQuery({ tab: "admin" }, { tab: ["player"] }), { ok: false });
  assert.deepEqual(parseCanonicalViewQuery({ tab: [] }, { tab: ["player"] }), { ok: false });
});

test("legacy application and season review destinations render distinct canonical states", () => {
  const applications = readFileSync(new URL("../src/app/(public)/(applications)/applications/page.tsx", import.meta.url), "utf8");
  const seasons = readFileSync(new URL("../src/app/(admin)/admin/seasons/page.tsx", import.meta.url), "utf8");
  assert.match(applications, /data-application-type/);
  assert.match(applications, /type: \["season", "event", "destruction"\]/);
  assert.match(applications, /source: \["pwa", "bookmark", "kakao"\]/);
  assert.match(seasons, /data-admin-season-view/);
  assert.match(seasons, /view=applications/);
  assert.match(seasons, /paginationSearch\.set\("view", "applications"\)/);
});
