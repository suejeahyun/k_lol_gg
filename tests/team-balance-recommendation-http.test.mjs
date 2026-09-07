import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("recommendation APIs keep owner/admin scope and the team-balance feature boundary", async () => {
  const [owner, admin, guard, repository] = await Promise.all([
    source("../src/app/api/team-tools/drafts/[draftId]/recommendations/route.ts"),
    source("../src/app/api/admin/team-tools/drafts/[draftId]/recommendations/route.ts"),
    source("../src/modules/team-tools/infrastructure/team-balance-http.ts"),
    source("../src/modules/team-tools/infrastructure/postgres-team-balance-recommendation-repository.ts"),
  ]);

  assert.match(owner, /requireTeamBalanceApiSession\("USER", request\)/);
  assert.match(owner, /authorization: "OWNER"/);
  assert.match(admin, /requireTeamBalanceApiSession\("ADMIN", request\)/);
  assert.match(admin, /authorization: "ADMIN"/);
  assert.match(guard, /requireSiteFeature\(request, "teamBalance"\)/);
  assert.match(repository, /draft\.ownerUserAccountId !== viewer\.actorUserAccountId/);
  assert.match(repository, /playerChampionStats/);
  assert.match(repository, /championCatalog\.status, "ACTIVE"/);
  assert.match(repository, /selectedCandidateSignature/);
});

test("team-balance pages expose recommendation views and fail closed with the site switch", async () => {
  const [ownerList, ownerDetail, adminList, adminDetail, root] = await Promise.all([
    source("../src/app/(public)/(tools)/tools/team-balance/drafts/page.tsx"),
    source("../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/page.tsx"),
    source("../src/app/(admin)/admin/balance/drafts/page.tsx"),
    source("../src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx"),
    source("../src/app/(public)/(tools)/tools/team-balance/page.tsx"),
  ]);

  for (const page of [ownerList, ownerDetail, adminList, adminDetail, root]) {
    assert.match(page, /readSiteFeatureState\("teamBalance"\)/);
  }
  assert.match(ownerList, /view=recommendations/);
  assert.match(ownerDetail, /tab=recommendations/);
  assert.match(adminList, /view=recommendations/);
  assert.match(adminDetail, /tab=recommendations/);
});
