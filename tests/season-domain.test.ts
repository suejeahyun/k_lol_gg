import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  kstDateKey,
  normalizeSeasonName,
  SeasonService,
  SeasonServiceError,
  seasonAcceptsApplications,
} from "../src/modules/seasons";
import { ClientMutationKeyStore } from "../src/modules/seasons/application/client-mutation-key-store";
import {
  availableApplicationSubPositions,
  reconcileApplicationSubPositions,
} from "../src/modules/seasons/application/client-application-positions";
import { kstDateTimeLocalFromIso, kstIsoFromDateTimeLocal } from "../src/modules/seasons/application/client-season-time";
import { parseAdminSeasonQuery } from "../src/modules/seasons/infrastructure/admin-season-query";

test("season domain normalizes names and produces stable canonical JSON", () => {
  assert.equal(normalizeSeasonName("  2026   가을  "), "2026 가을");
  assert.equal(canonicalJson({ z: 1, a: [2, { y: true, x: null }] }), '{"a":[2,{"x":null,"y":true}],"z":1}');
});

test("KST application date is independent of server timezone", () => {
  assert.equal(kstDateKey(new Date("2026-09-01T14:59:59.000Z")), "2026-09-01");
  assert.equal(kstDateKey(new Date("2026-09-01T15:00:00.000Z")), "2026-09-02");
});

test("only an active season inside its application window accepts applications", () => {
  const now = new Date("2026-09-01T10:00:00.000Z");
  assert.equal(
    seasonAcceptsApplications(
      {
        status: "ACTIVE",
        applicationsOpenAt: new Date("2026-09-01T09:00:00.000Z"),
        applicationsCloseAt: new Date("2026-09-01T11:00:00.000Z"),
      },
      now,
    ),
    true,
  );
  assert.equal(
    seasonAcceptsApplications(
      { status: "DRAFT", applicationsOpenAt: null, applicationsCloseAt: null },
      now,
    ),
    false,
  );
  assert.equal(
    seasonAcceptsApplications(
      { status: "ACTIVE", applicationsOpenAt: null, applicationsCloseAt: now },
      now,
    ),
    false,
  );
});

test("admin datetime-local values are converted to and from explicit KST instants", () => {
  assert.equal(kstIsoFromDateTimeLocal("2026-09-01T10:30"), "2026-09-01T10:30:00+09:00");
  assert.equal(kstDateTimeLocalFromIso("2026-09-01T01:30:00.000Z"), "2026-09-01T10:30");
  assert.throws(() => kstIsoFromDateTimeLocal("2026-02-30T10:30"));
});

test("client idempotency keys stay stable until success and follow the payload fingerprint", () => {
  let serial = 0;
  const store = new ClientMutationKeyStore("test", () => `key-${++serial}`);
  const first = store.issue("POST:/season", 0, { b: 2, a: 1 });
  const retry = store.issue("POST:/season", 0, { a: 1, b: 2 });
  const changed = store.issue("POST:/season", 0, { a: 2, b: 2 });
  assert.equal(retry.key, first.key);
  assert.notEqual(changed.key, first.key);
  store.complete(first);
  assert.notEqual(store.issue("POST:/season", 0, { a: 1, b: 2 }).key, first.key);
});

test("application position UI never offers or preserves an ALL mixture", () => {
  assert.deepEqual(availableApplicationSubPositions("ALL"), []);
  assert.deepEqual(availableApplicationSubPositions("TOP"), ["JGL", "MID", "ADC", "SUP"]);
  assert.deepEqual(reconcileApplicationSubPositions("ALL", ["TOP", "SUP"]), []);
  assert.deepEqual(
    reconcileApplicationSubPositions("TOP", ["ALL", "TOP", "MID", "MID", "SUP"]),
    ["MID", "SUP"],
  );
});

test("season commands require exact JSON keys, safe text and zoned ISO dates", () => {
  const service = new SeasonService({} as never);
  const context = {
    actorSession: {
      userAccountId: "11111111-1111-4111-8111-111111111111",
      sessionId: "44444444-4444-4444-8444-444444444444",
      role: "ADMIN" as const,
      authVersion: 0,
    },
    requestId: "22222222-2222-4222-8222-222222222222",
    idempotencyMaterial: new TextEncoder().encode("strict-season-test"),
  };
  assert.throws(
    () => service.createSeason(context, { name: "무오프셋", applicationsOpenAt: "2026-09-01T10:30" }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.createSeason(context, { name: "제어\n문자" }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.createSeason(context, { name: "표시\u202e스푸핑" }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.createSeason(context, { name: "표시\u200f스푸핑" }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.createSeason(context, { name: "정상", ignored: true }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.upsertOwnApplication(context, 0, { mainPosition: "ALL", subPositions: ["MID"] }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.activateSeason(context, "33333333-3333-4333-8333-333333333333", 0, { ignored: true }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => service.updateSeason(context, "33333333-3333-4333-8333-333333333333", 0, { name: "부분 편집" }),
    (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT",
  );
});

test("admin season query parser rejects unknown, duplicate, noncanonical and unsafe values", () => {
  for (const query of [
    "?pageSize=20",
    "?page=01",
    "?page=1e2",
    "?page=%201",
    "?status=APPLIED&status=RESERVE",
    "?q=hello%0Aworld",
    "?q=hello%E2%80%AEworld",
    "?q=hello%E2%80%8Fworld",
  ]) {
    assert.throws(() => parseAdminSeasonQuery(`https://example.test/admin/seasons${query}`));
  }
  assert.deepEqual(
    parseAdminSeasonQuery("https://example.test/admin/seasons?page=2&limit=10&q=%EF%BC%A1%20%20B"),
    { page: 2, pageSize: 10, query: "A B" },
  );
});
