import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = "src/app/(admin)/admin/matches/new/page.tsx";
const formPath = "src/features/match/MatchForm.impl.tsx";
const [pageSource, formSource] = await Promise.all([
  readFile(pagePath, "utf8"),
  readFile(formPath, "utf8"),
]);

for (const expected of [
  "draftSeasonId !== submissionSeasonId",
  "draftPlayers.length !== 10",
  "new Set(draftPlayers.map((entry) => entry.playerId)).size !== 10",
  "hasEverySlot",
  "participants: participants.map((participant) => ({ ...participant }))",
  "submissionImages={submission?.images.map",
]) {
  assert.ok(pageSource.includes(expected), `missing autofill guard: ${expected}`);
}

for (const expected of [
  "저장된 사진 자동 분석",
  "credentials: \"same-origin\"",
  "cache: \"no-store\"",
  "for (const [imageIndex, image] of orderedImages.entries())",
  "await handleImportLolResult(gameIndex, file",
  "실패한 세트는 기존 붙여넣기 방식으로 입력할 수 있습니다.",
]) {
  assert.ok(pageSource.includes(expected) || formSource.includes(expected), `missing stored-image flow: ${expected}`);
}

assert.match(
  formSource,
  /`\/api\/admin\/private-assets\/\$\{image\.privateAssetId\}`/,
  "stored images must continue through the admin-only private asset endpoint"
);

console.log("admin match submission autofill checks passed");
