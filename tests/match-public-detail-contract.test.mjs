import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("public match detail returns a not-found contract instead of a blank success", () => {
  const route = source("../src/app/api/matches/[matchId]/route.ts");
  const page = source("../src/app/(public)/(matches)/matches/[matchId]/page.tsx");
  const repository = source("../src/modules/matches/infrastructure/postgres-match-repository.ts");
  assert.match(route, /matchNotFoundResponse/);
  assert.match(route, /publicMatchIdPattern/);
  assert.match(page, /if \(result\.state === "ready" && !result\.data\) notFound\(\)/);
  assert.match(repository, /\.leftJoin\(championCatalog, eq\(championCatalog\.key, matchParticipants\.championKey\)\)/);
});
