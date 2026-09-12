import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("숫자형 플레이어·미디어 상세는 존재 확인 뒤 canonical UUID로 이동한다", () => {
  const player = source("../src/app/(public)/(registry)/players/[playerId]/page.tsx");
  const highlight = source("../src/app/(public)/(media)/highlights/[highlightId]/page.tsx");
  const gallery = source("../src/app/(public)/(media)/images/[imageId]/page.tsx");

  for (const token of ["parseLegacyPlayerId", "resolveRuntimePublicPlayerLegacyMapping", "permanentRedirect", "buildLegacyCanonicalIdDestination"]) {
    assert.equal(player.includes(token), true, `player: ${token}`);
  }
  for (const [name, page, resolver] of [
    ["highlight", highlight, "resolvePublicHighlightLegacyId"],
    ["gallery", gallery, "resolvePublicGalleryLegacyId"],
  ]) {
    for (const token of ["parseLegacyIntegerId", resolver, "permanentRedirect", "buildLegacyCanonicalIdDestination"]) {
      assert.equal(page.includes(token), true, `${name}: ${token}`);
    }
  }
});

test("숫자형 이벤트전·멸망전은 존재 확인 뒤 canonical UUID로 이동한다", () => {
  const publicEvent = source("../src/app/(public)/(competitions)/competitions/events/[eventId]/page.tsx");
  const adminEvent = source("../src/app/(admin)/admin/progress/event/[eventId]/page.tsx");
  const publicDestruction = source("../src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx");
  const adminDestruction = source("../src/app/(admin)/admin/progress/destruction/[tournamentId]/page.tsx");

  for (const [name, page] of [
    ["public event", publicEvent],
    ["admin event", adminEvent],
    ["public destruction", publicDestruction],
    ["admin destruction", adminDestruction],
  ]) {
    for (const token of ["parseLegacyIntegerId", "resolveLegacyId", "permanentRedirect", "buildLegacyCanonicalIdDestination"]) {
      assert.equal(page.includes(token), true, `${name}: ${token}`);
    }
  }

  for (const token of ["resolveRuntimePublicPlayerLegacyMapping", "canonicalViewQuery", "selectedPlayerId"]) {
    assert.equal(publicDestruction.includes(token), true, `public destruction: ${token}`);
  }
});
