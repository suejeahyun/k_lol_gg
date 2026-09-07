import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the contracted match edit page reuses the guarded editor and preserves the AI review alias", async () => {
  const [editPage, aiReview] = await Promise.all([
    readFile(new URL("../src/app/(admin)/admin/matches/[matchId]/edit/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(admin)/admin/matches/[matchId]/ai-review/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(editPage, /from\s+"\.\.\/page"/);
  assert.match(aiReview, /encodeURIComponent\(matchId\)/);
  assert.match(aiReview, /"tab",\s*"ai-review"/);
  assert.match(aiReview, /308/);
});
