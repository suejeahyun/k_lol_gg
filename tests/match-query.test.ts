import assert from "node:assert/strict";
import test from "node:test";

import {
  decodePublicMatchCursor,
  encodeOwnSubmissionCursor,
  encodePublicMatchCursor,
  parseAdminPlayerOptionQuery,
  parseAdminMatchQuery,
  parseMatchSubmitPageQuery,
  parseOwnSubmissionQuery,
  parsePublicMatchQuery,
  publicMatchFilterFingerprint,
} from "../src/modules/matches/infrastructure/match-query";
import { adminPlayerSearchStrategy, escapeLikeLiteral } from "../src/modules/matches/infrastructure/postgres-match-repository";

const seasonId = "10000000-0000-4000-8000-000000000000";

test("match submit page accepts one canonical continuation or owned draft reference", () => {
  const draftId = "20000000-0000-4000-8000-000000000000";
  assert.deepEqual(parseMatchSubmitPageQuery({}), { code: null, teamBalanceDraftId: null });
  assert.deepEqual(parseMatchSubmitPageQuery({ teamBalanceDraftId: draftId.toUpperCase() }), {
    code: null,
    teamBalanceDraftId: draftId,
  });
  assert.deepEqual(parseMatchSubmitPageQuery({ code: "MR2A1B2C3D4E5F60708" }), {
    code: "MR2A1B2C3D4E5F60708",
    teamBalanceDraftId: null,
  });
  assert.equal(parseMatchSubmitPageQuery({ teamBalanceDraftId: "forged" }), null);
  assert.equal(parseMatchSubmitPageQuery({ teamBalanceDraftId: [draftId, draftId] }), null);
  assert.equal(parseMatchSubmitPageQuery({ code: "MR2A1B2C3D4E5F60708", teamBalanceDraftId: draftId }), null);
  assert.equal(parseMatchSubmitPageQuery({ next: "//evil.invalid" }), null);
});

test("public match query is exact, duplicate-safe and date bounded", () => {
  assert.deepEqual(parsePublicMatchQuery(`https://example.test/api/matches?seasonId=${seasonId}&winner=BLUE&page=2`), {
    seasonId,
    winner: "BLUE",
    sort: "playedOn",
    order: "desc",
    page: 2,
    pageSize: 12,
  });
  assert.equal(parsePublicMatchQuery("https://example.test/api/matches?page=1&page=2"), null);
  assert.equal(parsePublicMatchQuery("https://example.test/api/matches?unknown=1"), null);
  assert.equal(parsePublicMatchQuery("https://example.test/api/matches?q=safe%E2%80%AEbad"), null);
  assert.equal(parsePublicMatchQuery("https://example.test/api/matches?from=2026-09-02&to=2026-09-01"), null);
  assert.equal(parsePublicMatchQuery("https://example.test/api/matches?winner=UNKNOWN"), null);
  assert.deepEqual(parsePublicMatchQuery("https://example.test/api/matches?winner=TIE"), {
    winner: "TIE",
    sort: "playedOn",
    order: "desc",
    page: 1,
    pageSize: 12,
  });
});

test("admin match query separates match and submission filters", () => {
  assert.deepEqual(parseAdminMatchQuery("https://example.test/api/admin/matches?view=submissions&season=UNASSIGNED&submissionStatus=PENDING_REVIEW"), {
    view: "submissions",
    season: "UNASSIGNED",
    submissionStatus: "PENDING_REVIEW",
    page: 1,
    pageSize: 20,
  });
  assert.equal(parseAdminMatchQuery("https://example.test/api/admin/matches?matchStatus=APPROVED"), null);
  assert.equal(parseAdminMatchQuery("https://example.test/api/admin/matches?view=submissions&matchStatus=DRAFT"), null);
  assert.equal(parseAdminMatchQuery("https://example.test/api/admin/matches?submissionStatus=REJECTED"), null);
  assert.equal(parseAdminMatchQuery("https://example.test/api/admin/matches?view=matches&view=submissions"), null);
});

test("admin player picker query is bounded, canonical and duplicate-safe", () => {
  assert.deepEqual(
    parseAdminPlayerOptionQuery(`https://example.test/api/admin/matches/editor-options/players?q=%20Alice%20&include=${seasonId.toUpperCase()}`),
    { query: "Alice", includePlayerIds: [seasonId] },
  );
  assert.equal(parseAdminPlayerOptionQuery("https://example.test/api/admin/matches/editor-options/players?q=a&q=b"), null);
  assert.equal(parseAdminPlayerOptionQuery("https://example.test/api/admin/matches/editor-options/players?q=a"), null);
  assert.equal(parseAdminPlayerOptionQuery("https://example.test/api/admin/matches/editor-options/players?q=%E2%80%AEbad"), null);
  assert.equal(parseAdminPlayerOptionQuery(`https://example.test/api/admin/matches/editor-options/players?q=a&include=${seasonId},${seasonId}`), null);
});

test("literal substring filters escape SQL LIKE metacharacters", () => {
  assert.equal(escapeLikeLiteral("100%_\\name"), "100\\%\\_\\\\name");
});

test("admin player picker uses indexed prefix or exact combined Riot ID strategy", () => {
  assert.deepEqual(adminPlayerSearchStrategy(" GameName#TAG "), {
    kind: "RIOT_ID_EXACT",
    nickname: "gamename",
    tagLine: "tag",
  });
  assert.deepEqual(adminPlayerSearchStrategy("100%_"), {
    kind: "NORMALIZED_PREFIX",
    prefix: "100\\%\\_%",
  });
});

test("public match cursor is opaque, exact and coupled to sort/order", () => {
  const cursor = encodePublicMatchCursor({
    sort: "playedOn",
    order: "desc",
    playedOn: "2026-09-01",
    startedAt: "2026-09-01T12:00:00.000Z",
    id: seasonId,
    filterFingerprint: publicMatchFilterFingerprint({
      sort: "playedOn",
      order: "desc",
      pageSize: 12,
    }),
  });
  assert.equal(cursor.includes("2026-09-01"), false);
  assert.deepEqual(decodePublicMatchCursor(cursor), {
    sort: "playedOn",
    order: "desc",
    playedOn: "2026-09-01",
    startedAt: "2026-09-01T12:00:00.000Z",
    id: seasonId,
    filterFingerprint: publicMatchFilterFingerprint({
      sort: "playedOn",
      order: "desc",
      pageSize: 12,
    }),
  });
  assert.ok(parsePublicMatchQuery(`https://example.test/api/matches?cursor=${cursor}`));
  assert.equal(parsePublicMatchQuery(`https://example.test/api/matches?cursor=${cursor}&order=asc`), null);
  assert.equal(parsePublicMatchQuery(`https://example.test/api/matches?cursor=${cursor}&page=2`), null);
});

test("own submission history cursor is status-bound and reaches beyond the first page", () => {
  const cursor = encodeOwnSubmissionCursor({
    updatedAt: "2026-09-01T00:00:00.000Z",
    id: seasonId,
    status: "REJECTED",
  });
  assert.deepEqual(
    parseOwnSubmissionQuery(
      `https://example.test/api/me/match-submissions?status=REJECTED&cursor=${cursor}&pageSize=50`,
    ),
    {
      status: "REJECTED",
      cursor: { updatedAt: "2026-09-01T00:00:00.000Z", id: seasonId },
      pageSize: 50,
    },
  );
  assert.equal(
    parseOwnSubmissionQuery(
      `https://example.test/api/me/match-submissions?status=APPROVED&cursor=${cursor}`,
    ),
    null,
  );
});
