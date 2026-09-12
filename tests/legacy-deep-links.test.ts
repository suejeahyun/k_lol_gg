import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { MediaService, type MediaRepository } from "../src/modules/media";
import {
  deriveLegacyCompetitionUuid,
  MAXIMUM_LEGACY_INTEGER_ID,
  parseLegacyIntegerId,
} from "../src/platform/legacy-identifiers";

test("legacy 정수 ID는 양의 PostgreSQL int32 canonical 형식만 허용한다", () => {
  assert.equal(parseLegacyIntegerId("1"), 1);
  assert.equal(parseLegacyIntegerId(MAXIMUM_LEGACY_INTEGER_ID), MAXIMUM_LEGACY_INTEGER_ID);
  for (const value of ["0", "01", "1.0", "-1", "2147483648", randomUUID(), Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseLegacyIntegerId(value), null);
  }
});

test("대회 legacy UUID는 승인된 PostgreSQL cutover recipe와 일치한다", () => {
  assert.equal(
    deriveLegacyCompetitionUuid("competition.event_competitions", 1),
    "05b25b16-00ef-4063-ac51-2e7040b5625e",
  );
  assert.equal(
    deriveLegacyCompetitionUuid("competition.destruction_competitions", "42"),
    "48562a83-d3fb-4112-abf2-89101128b40b",
  );
  assert.equal(deriveLegacyCompetitionUuid("competition.event_competitions", "01"), null);
});

test("미디어 legacy resolver는 유효한 숫자만 공개 매핑 port로 전달한다", async () => {
  const highlightId = randomUUID();
  const galleryId = randomUUID();
  const calls: string[] = [];
  const repository = {
    async findPublicHighlightUuidByLegacyId(legacyId: number) {
      calls.push(`highlight:${legacyId}`);
      return highlightId;
    },
    async findPublicGalleryUuidByLegacyId(legacyId: number) {
      calls.push(`gallery:${legacyId}`);
      return galleryId;
    },
  } as unknown as MediaRepository;
  const service = new MediaService(repository);

  assert.equal(await service.resolvePublicHighlightLegacyId("17"), highlightId);
  assert.equal(await service.resolvePublicGalleryLegacyId(29), galleryId);
  assert.equal(await service.resolvePublicHighlightLegacyId("017"), null);
  assert.deepEqual(calls, ["highlight:17", "gallery:29"]);
});
