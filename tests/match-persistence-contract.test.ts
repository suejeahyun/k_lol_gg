import assert from "node:assert/strict";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import { submissionSnapshot } from "../src/modules/matches/infrastructure/postgres-match-repository";
import {
  matchParticipants,
  matchRecalculationOutbox,
  matchSeries,
} from "../src/platform/db/schema/matches";

test("match participant schema requires immutable display identity snapshots", () => {
  const config = getTableConfig(matchParticipants);
  const columns = new Map(config.columns.map((column) => [column.name, column]));
  assert.equal(columns.get("nickname_snapshot")?.notNull, true);
  assert.equal(columns.get("tag_line_snapshot")?.notNull, true);
  assert.ok(config.checks.some((check) => check.name === "match_participants_nickname_snapshot_nonempty"));
  assert.ok(config.checks.some((check) => check.name === "match_participants_tag_line_snapshot_nonempty"));
});

test("match series and each recalculation event carry nullable team-balance provenance", () => {
  const seriesConfig = getTableConfig(matchSeries);
  const seriesColumns = new Map(seriesConfig.columns.map((column) => [column.name, column]));
  assert.equal(seriesColumns.get("team_balance_draft_id")?.notNull, false);
  assert.ok(seriesConfig.indexes.some((index) => index.config.name === "match_series_team_balance_draft_idx"));

  const outboxConfig = getTableConfig(matchRecalculationOutbox);
  const outboxColumns = new Map(outboxConfig.columns.map((column) => [column.name, column]));
  assert.equal(outboxColumns.get("team_balance_draft_id")?.notNull, false);
});

test("submission audit snapshots retain a public rejection reason before reopen clears the live row", () => {
  const rejectedRow = {
    id: "10000000-0000-4000-8000-000000000000",
    legacyId: null,
    publicCode: "MR2A1B2C3D4E5F60708",
    ownerUserAccountId: "20000000-0000-4000-8000-000000000000",
    seasonId: null,
    title: "감사 스냅샷 접수",
    organizer: "진행자",
    seriesNumber: 1,
    note: null,
    playedOn: "2026-09-07",
    startedAt: null,
    startedAtOffsetMinutes: null,
    expectedGameCount: 2,
    teamBalanceDraftId: null,
    source: "WEB",
    sourceReferenceHash: Buffer.alloc(32, 1),
    provenanceJson: null,
    reviewedResultJson: null,
    status: "REJECTED",
    publicReviewReason: "이미지에서 두 번째 경기 결과를 확인할 수 없습니다.",
    reviewedByUserAccountId: "30000000-0000-4000-8000-000000000000",
    reviewedAt: new Date("2026-09-07T03:00:00.000Z"),
    cancelledAt: null,
    approvedMatchSeriesId: null,
    revision: 2,
    createdAt: new Date("2026-09-07T02:00:00.000Z"),
    updatedAt: new Date("2026-09-07T03:00:00.000Z"),
  } as Parameters<typeof submissionSnapshot>[0];

  const rejectAfter = submissionSnapshot(rejectedRow);
  const reopenBefore = submissionSnapshot(rejectedRow);
  const reopenAfter = submissionSnapshot({
    ...rejectedRow,
    status: "PENDING_REVIEW",
    publicReviewReason: null,
    reviewedByUserAccountId: null,
    reviewedAt: null,
    revision: 3,
  });

  assert.equal(rejectAfter.publicReviewReason, rejectedRow.publicReviewReason);
  assert.equal(reopenBefore.publicReviewReason, rejectedRow.publicReviewReason);
  assert.equal(reopenAfter.publicReviewReason, null);
});
