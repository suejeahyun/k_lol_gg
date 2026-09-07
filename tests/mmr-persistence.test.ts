import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminMmrPlayersDestination,
  buildAdminMmrReviewsDestination,
  parseMmrPlayerQuery,
  parseMmrReviewQuery,
} from "../src/modules/mmr";

test("MMR public query accepts only singular canonical allowlisted filters", () => {
  assert.deepEqual(
    parseMmrPlayerQuery("https://v2.example/rankings/mmr?q=%20Faker%20&position=MID&page=2&pageSize=50"),
    { query: "Faker", position: "MID", page: 2, pageSize: 50 },
  );
  assert.equal(parseMmrPlayerQuery("https://v2.example/rankings/mmr?token=secret"), null);
  assert.equal(parseMmrPlayerQuery("https://v2.example/rankings/mmr?q=a&q=b"), null);
  assert.equal(parseMmrPlayerQuery("https://v2.example/rankings/mmr?position=ALL"), null);
  assert.deepEqual(parseMmrReviewQuery("https://v2.example/api/admin/balance-ai/reviews?page=1&pageSize=20"), {
    page: 1,
    pageSize: 20,
  });
});

test("MMR integrated admin redirects drop unsafe and unknown query values", () => {
  assert.equal(
    buildAdminMmrPlayersDestination({ q: "Faker", position: "MID", page: "2", pageSize: "50", next: "//evil" }),
    "/admin/balance-ai?tab=players&q=Faker&position=MID&page=2&pageSize=50",
  );
  const reviewId = "018fa2d0-8d4e-7abc-8def-1234567890ab";
  assert.equal(
    buildAdminMmrReviewsDestination({ page: "3", token: "drop" }, reviewId.toUpperCase()),
    `/admin/balance-ai?tab=reviews&review=${reviewId}&page=3`,
  );
  assert.equal(buildAdminMmrReviewsDestination({}, "../users"), "/admin/balance-ai?tab=reviews");
});
