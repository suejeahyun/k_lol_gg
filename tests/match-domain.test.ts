import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  captureMatchGameSnapshots,
  calculateMvpScore,
  calculateMvpScoreUnits2,
  canonicalSubmissionPublicCode,
  EMPTY_MATCH_SERIES_PROVENANCE,
  matchSeriesProvenanceFromSubmission,
  MVP_FORMULA,
  parseKstDate,
  parseMatchRecordInput,
  parseOptionalLegacyId,
  parseStartedAt,
  parseSubmissionCreateInput,
  selectGameMvp,
  toMatchGameInput,
} from "../src/modules/matches/domain/match";

test("submission continuation code is strict uppercase and canonical", () => {
  assert.equal(canonicalSubmissionPublicCode("MR2A1B2C3D4E5F60708"), "MR2A1B2C3D4E5F60708");
  assert.equal(canonicalSubmissionPublicCode("mr2a1b2c3d4e5f60708"), null);
  assert.equal(canonicalSubmissionPublicCode(" MR2A1B2C3D4E5F60708"), null);
});

test("offline legacy match ids use the exact PostgreSQL int32 compatibility range", () => {
  assert.equal(parseOptionalLegacyId(null), null);
  assert.equal(parseOptionalLegacyId(1), 1);
  assert.equal(parseOptionalLegacyId(2_147_483_647), 2_147_483_647);
  assert.equal(parseOptionalLegacyId(2_147_483_648), "INVALID");
  assert.equal(parseOptionalLegacyId(Number.MAX_SAFE_INTEGER), "INVALID");
});
import {
  FakePrivateImageStorage,
  fakePrivateAdaptersAllowed,
  validatePrivateScoreboardImage,
} from "../src/modules/matches/infrastructure/private-image";

const players = Array.from({ length: 10 }, (_, index) => ({
  playerId: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
  championKey: `champion-${index + 1}`,
  team: index < 5 ? "BLUE" : "RED",
  position: ["TOP", "JGL", "MID", "ADC", "SUP"][index % 5],
  kills: index,
  deaths: 2,
  assists: 4,
}));

const validRecord = {
  seasonId: "10000000-0000-4000-8000-000000000000",
  title: " 9월 첫 내전 ",
  playedOn: "2026-09-01",
  startedAt: "2026-09-01T21:00:00+09:00",
  games: [
    {
      gameNumber: 1,
      durationSeconds: 1800,
      winnerTeam: "BLUE",
      participants: players,
    },
  ],
};

test("MVP v1 formula is the only versioned score source", () => {
  assert.equal(MVP_FORMULA.version, "V1_COMPAT_1");
  assert.equal(
    calculateMvpScore({ kills: 3, deaths: 2, assists: 5 }),
    17.5,
  );
  assert.equal(calculateMvpScoreUnits2({ kills: 3, deaths: 2, assists: 5 }), 35);
  assert.equal(calculateMvpScore({ kills: 0, deaths: 99, assists: 0 }), -193);
  const parsed = parseMatchRecordInput(validRecord);
  assert.ok(parsed);
  const mvp = selectGameMvp(parsed.games[0]);
  assert.equal(mvp.playerId, players[4].playerId);
  assert.equal(mvp.formulaVersion, "V1_COMPAT_1");
  assert.equal(mvp.selection, "WINNER_SCORE_KDA_PLAYER_ID_V1");
});

test("MVP V1 compatibility tie-break is score, kills, deaths, assists, player id", () => {
  const baseGame = parseMatchRecordInput(validRecord)?.games[0];
  assert.ok(baseGame);
  const winner = baseGame.participants.filter((participant) => participant.team === "BLUE");
  const tied = [
    { ...winner[0], kills: 3, deaths: 1, assists: 0 },
    { ...winner[1], kills: 2, deaths: 1, assists: 2 },
    ...winner.slice(2).map((participant) => ({ ...participant, kills: 0, deaths: 20, assists: 0 })),
    ...baseGame.participants.filter((participant) => participant.team === "RED"),
  ];
  const selected = selectGameMvp({ ...baseGame, participants: tied });
  assert.equal(calculateMvpScoreUnits2(tied[0]), calculateMvpScoreUnits2(tied[1]));
  assert.equal(selected.playerId, tied[0].playerId, "higher kills wins equal score");

  const sameKda = tied.map((participant, index) =>
    index < 2 ? { ...participant, kills: 2, deaths: 1, assists: 2 } : participant,
  );
  const idWinner = selectGameMvp({ ...baseGame, participants: sameKda });
  assert.equal(idWinner.playerId, [sameKda[0].playerId, sameKda[1].playerId].sort()[0]);
});

test("participant display identity is server-captured and retained across unrelated amendments", () => {
  const parsed = parseMatchRecordInput(validRecord);
  assert.ok(parsed);
  const identities = parsed.games[0].participants.map((participant, index) => ({
    playerId: participant.playerId,
    nickname: `당시닉${index + 1}`,
    tagLine: `OLD${index + 1}`,
  }));
  const initial = captureMatchGameSnapshots(parsed.games, identities);
  assert.equal(initial[0].participants[0].nicknameSnapshot, "당시닉1");
  assert.equal(initial[0].participants[0].tagLineSnapshot, "OLD1");

  const renamed = identities.map((identity, index) => ({
    ...identity,
    nickname: `현재닉${index + 1}`,
    tagLine: `NEW${index + 1}`,
  }));
  const existingNine = [{
    ...initial[0],
    participants: initial[0].participants.slice(0, 9),
  }];
  const amended = captureMatchGameSnapshots(parsed.games, renamed, existingNine);
  assert.equal(amended[0].participants[0].nicknameSnapshot, "당시닉1", "existing player keeps history");
  assert.equal(amended[0].participants[9].nicknameSnapshot, "현재닉10", "new participant uses locked registry identity");
  assert.equal("nicknameSnapshot" in toMatchGameInput(amended[0]).participants[0], false);
  assert.throws(
    () => captureMatchGameSnapshots(parsed.games, identities.slice(1)),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_INPUT",
  );
});

test("KST date and explicit started-at offset are strict", () => {
  assert.equal(parseKstDate("2024-02-29"), "2024-02-29");
  assert.equal(parseKstDate("2023-02-29"), null);
  assert.equal(parseStartedAt("2026-09-01T21:00:00+09:00", "2026-09-01")?.startedAtOffsetMinutes, 540);
  assert.equal(parseStartedAt("2026-08-31T23:00:00+09:00", "2026-09-01"), null);
  assert.equal(parseStartedAt("2026-09-01T21:00:00", "2026-09-01"), null);
});

test("complete match input rejects unknown keys, bidi text and incomplete rosters", () => {
  const parsed = parseMatchRecordInput(validRecord);
  assert.ok(parsed);
  assert.equal(parsed.title, "9월 첫 내전");
  assert.equal(parsed.startedAtOffsetMinutes, 540);

  assert.equal(parseMatchRecordInput({ ...validRecord, surprise: true }), null);
  assert.equal(parseMatchRecordInput({ ...validRecord, title: "safe\u202Eunsafe" }), null);
  assert.equal(
    parseMatchRecordInput({
      ...validRecord,
      games: [{
        ...validRecord.games[0],
        participants: validRecord.games[0].participants.map((participant, index) =>
          index === 0
            ? { ...participant, nicknameSnapshot: "클라이언트 위조", tagLineSnapshot: "BAD" }
            : participant,
        ),
      }],
    }),
    null,
    "client write DTO cannot supply server-owned display snapshots",
  );
  assert.equal(
    parseMatchRecordInput({
      ...validRecord,
      games: [{ ...validRecord.games[0], participants: players.slice(0, 9) }],
    }),
    null,
  );
  assert.equal(
    parseMatchRecordInput({
      ...validRecord,
      games: [{ ...validRecord.games[0], participants: players.map((p) => ({ ...p, position: "TOP" })) }],
    }),
    null,
  );
  const caseVariant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(
    parseMatchRecordInput({
      ...validRecord,
      games: [
        {
          ...validRecord.games[0],
          participants: validRecord.games[0].participants.map((participant, index) =>
            index === 0
              ? { ...participant, playerId: caseVariant.toUpperCase() }
              : index === 1
                ? { ...participant, playerId: caseVariant }
                : participant,
          ),
        },
      ],
    }),
    null,
    "case variants canonicalize before duplicate detection",
  );
  assert.equal(
    parseMatchRecordInput({
      ...validRecord,
      games: [
        {
          ...validRecord.games[0],
          participants: validRecord.games[0].participants.map((participant, index) =>
            index === 0
              ? { ...participant, championKey: "Ahri" }
              : index === 1
                ? { ...participant, championKey: "AHRI" }
                : participant,
          ),
        },
      ],
    }),
    null,
    "champion case aliases canonicalize before per-game uniqueness",
  );
});

test("submission input has a bounded image/game count", () => {
  const base = {
    requestId: "request-12345678",
    seasonId: validRecord.seasonId,
    title: validRecord.title,
    organizer: "진행자",
    seriesNumber: 1,
    note: null,
    playedOn: validRecord.playedOn,
    startedAt: null,
    expectedGameCount: 3,
    teamBalanceDraftId: null,
  };
  assert.ok(parseSubmissionCreateInput(base));
  assert.ok(parseSubmissionCreateInput({ ...base, seasonId: null }));
  const draftId = "20000000-0000-4000-8000-000000000000";
  const linked = parseSubmissionCreateInput({ ...base, teamBalanceDraftId: draftId.toUpperCase() });
  assert.equal(linked?.teamBalanceDraftId, draftId);
  assert.deepEqual(matchSeriesProvenanceFromSubmission(linked!), { teamBalanceDraftId: draftId });
  assert.deepEqual(EMPTY_MATCH_SERIES_PROVENANCE, { teamBalanceDraftId: null });
  assert.equal(parseSubmissionCreateInput({ ...base, expectedGameCount: 6 }), null);
  assert.equal(parseSubmissionCreateInput({ ...base, title: "x\u0000y" }), null);
  assert.equal(parseSubmissionCreateInput({ ...base, expectedGameCount: 1 }), null);
  assert.equal(parseSubmissionCreateInput({ ...base, requestId: "short" }), null);
});

test("private image validator fully decodes, checks bounds/container end and SHA", async () => {
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const validated = await validatePrivateScoreboardImage({
    bytes: png,
    declaredContentType: "image/png",
    originalFileName: "score.png",
  });
  assert.equal(validated.contentType, "image/png");
  assert.equal(validated.sha256.length, 32);
  assert.equal(validated.width, 32);
  assert.equal(validated.height, 32);
  await assert.rejects(
    validatePrivateScoreboardImage({ bytes: png, declaredContentType: "image/jpeg" }),
    /실제 파일 형식/,
  );
  await assert.rejects(
    validatePrivateScoreboardImage({
      bytes: Buffer.concat([png, Buffer.from("trailing-polyglot")]),
      declaredContentType: "image/png",
    }),
    /실제 파일 형식/,
  );
  await assert.rejects(
    validatePrivateScoreboardImage({
      bytes: png.subarray(0, png.length - 8),
      declaredContentType: "image/png",
    }),
    /실제 파일 형식/,
  );
  const storage = new FakePrivateImageStorage();
  const storageKey = "fake-match-scoreboards/deterministic-fixture";
  const signal = new AbortController().signal;
  await storage.stageAt({ storageKey, bytes: png, sha256Hex: validated.sha256Hex, signal });
  await storage.stageAt({ storageKey, bytes: png, sha256Hex: validated.sha256Hex, signal });
  assert.equal(storage.stored.get(storageKey)?.length, png.length);
  assert.equal((await storage.read(storageKey, signal))?.length, png.length);
  await storage.requestDelete(storageKey, signal);
  assert.equal(storage.stored.has(storageKey), false);
});

test("fake private adapters are exact development and non-Vercel only", () => {
  assert.equal(fakePrivateAdaptersAllowed({ NODE_ENV: "development", V2_FAKE_PRIVATE_ASSETS: "1" }), true);
  assert.equal(fakePrivateAdaptersAllowed({ NODE_ENV: "test", V2_FAKE_PRIVATE_ASSETS: "1" }), false);
  assert.equal(fakePrivateAdaptersAllowed({ NODE_ENV: "development", V2_FAKE_PRIVATE_ASSETS: "1", VERCEL: "1" }), false);
});
