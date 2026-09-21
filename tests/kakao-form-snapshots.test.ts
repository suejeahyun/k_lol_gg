import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "../src/modules/competitions/core/command-contracts";
import {
  issueKakaoFormSnapshot,
  kakaoFormSnapshotExpiry,
  kakaoFormSnapshotStateHash,
  loadKakaoFormSnapshot,
  normalizeKakaoFormSnapshotCode,
} from "../src/modules/recruiting/infrastructure/kakao-form-snapshots";
import type { V2Transaction } from "../src/platform/db/transaction";

test("form codes are readable ASCII and normalize mobile fullwidth/lowercase input", () => {
  assert.equal(normalizeKakaoFormSnapshotCode(" abcde-23456 "), "ABCDE-23456");
  assert.equal(normalizeKakaoFormSnapshotCode("ＡＢＣＤＥ－２３４５６"), "ABCDE-23456");
  for (const input of ["ABCDE23456", "ABCDE-01234", "ABCDE-I2345", "ABCDE-O2345", "ABCDE-23456x", "x ABCDE-23456", ""]) {
    assert.equal(normalizeKakaoFormSnapshotCode(input), null);
  }
});

test("snapshot expiry is precisely the next 06:00 KST, including month/year boundaries", () => {
  assert.equal(kakaoFormSnapshotExpiry("2026-09-20").toISOString(), "2026-09-20T21:00:00.000Z");
  assert.equal(kakaoFormSnapshotExpiry("2026-12-31").toISOString(), "2026-12-31T21:00:00.000Z");
  for (const invalid of ["2026-02-30", "2026-13-01", "2026-9-1", "not-a-date"]) {
    assert.throws(() => kakaoFormSnapshotExpiry(invalid), /INVALID_KAKAO_FORM_OPERATING_DATE/);
  }
});

test("identical canonical snapshot objects reuse their hash while row order remains significant", () => {
  const first = { revision: 4, rows: [{ name: "민규", reserve: false, slot: 1 }], metadata: { game: "배그", time: "미정" } };
  const reordered = { metadata: { time: "미정", game: "배그" }, rows: [{ slot: 1, reserve: false, name: "민규" }], revision: 4 };
  assert.deepEqual(kakaoFormSnapshotStateHash(first), kakaoFormSnapshotStateHash(reordered));
  assert.notDeepEqual(kakaoFormSnapshotStateHash(first), kakaoFormSnapshotStateHash({ ...first, revision: 5 }));
  assert.notDeepEqual(kakaoFormSnapshotStateHash({ rows: [1, 2] }), kakaoFormSnapshotStateHash({ rows: [2, 1] }));
});

test("snapshot storage rejects non-JSON, oversize and pathological nested originals before querying", () => {
  for (const invalid of [null, [], "not-an-object", 1, true, { value: undefined }, { value: NaN }, { value: new Date() }, { value: BigInt(1) }]) {
    assert.throws(() => kakaoFormSnapshotStateHash(invalid as unknown as JsonObject), /INVALID_KAKAO_FORM_SNAPSHOT_STATE/);
  }
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => kakaoFormSnapshotStateHash(circular as JsonObject), /INVALID_KAKAO_FORM_SNAPSHOT_STATE/);
  assert.throws(() => kakaoFormSnapshotStateHash({ value: "가".repeat(22_000) }), /KAKAO_FORM_SNAPSHOT_TOO_LARGE/);
  assert.throws(() => kakaoFormSnapshotStateHash({ value: Array.from({ length: 24_000 }, () => 0) }), /KAKAO_FORM_SNAPSHOT_TOO_LARGE/);
});

test("old-day, invalid scope and invalid code cannot read or issue snapshots", async () => {
  const noDatabase = {} as V2Transaction;
  const binding = { kind: "PARTY" as const, scopeHash: Buffer.alloc(32, 7), targetId: "party-id", operatingDate: "2026-09-20", now: new Date("2026-09-20T06:00:00+09:00") };
  await assert.rejects(issueKakaoFormSnapshot(noDatabase, { ...binding, scopeHash: Buffer.alloc(31), state: {} }), /INVALID_KAKAO_FORM_SNAPSHOT_BINDING/);
  await assert.rejects(issueKakaoFormSnapshot(noDatabase, { ...binding, operatingDate: "2026-09-19", state: {} }), /INVALID_KAKAO_FORM_SNAPSHOT_BINDING/);
  assert.equal(await loadKakaoFormSnapshot(noDatabase, { ...binding, code: "not-a-code" }), null);
  assert.equal(await loadKakaoFormSnapshot(noDatabase, { ...binding, code: "ABCDE-23456", operatingDate: "2026-09-19" }), null);
});
