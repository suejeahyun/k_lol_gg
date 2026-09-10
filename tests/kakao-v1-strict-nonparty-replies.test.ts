import assert from "node:assert/strict";
import test from "node:test";

import type {
  KakaoPlayerRecordDto,
  KakaoRankingDto,
  KakaoSeasonSnapshotDto,
} from "../src/modules/recruiting/kakao-assistant/domain";
import {
  v1StrictOperationFormReply,
  v1StrictPlayerRecordReply,
  v1StrictRankingReply,
  v1StrictSeasonReply,
} from "../src/modules/recruiting/kakao-v4/v1-strict-replies";

const playerBase: KakaoPlayerRecordDto = {
  kind: "PLAYER_RECORD",
  mode: "RECORD",
  query: "재현#KR1",
  player: { playerId: "00000000-0000-4000-8000-000000000001", displayName: "재현", riotId: "재현#KR1" },
  currentTier: null,
  peakTier: null,
  season: null,
  summary: {
    totalGames: 12,
    participationCount: 5,
    wins: 6,
    losses: 6,
    winRate: 50,
    mvpCount: 2,
    kills: 30,
    deaths: 20,
    assists: 40,
    kda: 3.5,
  },
  recentMatches: [
    { matchId: "m1", title: "1회차", playedOn: "2026-09-10", gameNumber: 1, championName: "아리", team: "BLUE", position: "MID", won: true, mvp: false, kills: 7, deaths: 2, assists: 8 },
    { matchId: "m2", title: "2회차", playedOn: "2026-09-09", gameNumber: 1, championName: "럭스", team: "RED", position: "SUP", won: false, mvp: false, kills: 1, deaths: 5, assists: 9 },
  ],
};

test("V1 strict record always shows season/tier and the canonical multi-game recent line", () => {
  assert.equal(v1StrictPlayerRecordReply(playerBase), [
    "[재현#KR1 전적]", "", "시즌: 전체", "티어: 미입력", "참여: 5회 / 12세트",
    "전적: 6승 6패 (50.0%)", "KDA: 3.50 (30/20/40)", "MVP: 2회", "",
    "최근: 승 아리 7/2/8 | 패 럭스 1/5/9", "",
    "https://k-lol-gg.vercel.app/players/00000000-0000-4000-8000-000000000001",
  ].join("\n"));
});

test("V1 strict recent, missing player, and empty ranking preserve the canonical copy", () => {
  assert.equal(v1StrictPlayerRecordReply({ ...playerBase, mode: "RECENT", recentMatches: [] }), "[재현#KR1 최근 경기]\n최근 경기 기록이 없습니다.");
  assert.equal(v1StrictPlayerRecordReply({ ...playerBase, player: null, summary: null, recentMatches: [] }),
    "검색 결과가 없습니다.\n닉네임#태그를 확인해주세요.\n\n입력값: 재현#KR1");
  assert.equal(v1StrictPlayerRecordReply({ ...playerBase, mode: "RECENT", player: null, summary: null, recentMatches: [] }),
    "검색 결과가 없습니다.\n닉네임#태그를 확인해주세요.\n\n예시: 전적 sax0ph0ne#99단굵묵");
  const emptyRanking: KakaoRankingDto = { kind: "RANKING", season: null, minimumParticipation: 10, rows: [], truncated: false };
  assert.equal(v1StrictRankingReply(emptyRanking), "랭킹 데이터가 없습니다.\n기준: 내전 참여 10회 이상");
});

test("V1 strict operation and season empty replies keep public V1 labels", () => {
  assert.deepEqual([
    v1StrictOperationFormReply("friends"),
    v1StrictOperationFormReply("suggestions"),
    v1StrictOperationFormReply("meetups"),
    v1StrictOperationFormReply("leaves"),
  ], [
    "[K-LOL.GG 디스코드 초대 신청 접수 완료]",
    "[K-LOL.GG 건의 접수 완료]",
    "[K-LOL.GG 모임 등록 접수 완료]",
    "[K-LOL.GG 외출 신청 접수 완료]",
  ]);
  assert.equal(v1StrictSeasonReply({
    kind: "SEASON_APPLICATION_SNAPSHOT",
    seasonId: "00000000-0000-4000-8000-000000000001",
    applyDate: "2026-09-11",
    recruitNo: null,
    entries: [],
    appliedCount: 0,
    reserveCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    availableRecruitNos: [],
  }, "STATUS"), "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.");
});

function seasonSnapshot(input: Partial<KakaoSeasonSnapshotDto>): KakaoSeasonSnapshotDto {
  return {
    kind: "SEASON_APPLICATION_SNAPSHOT",
    seasonId: "00000000-0000-4000-8000-000000000001",
    applyDate: "2026-09-11",
    recruitNo: null,
    entries: [],
    appliedCount: 0,
    reserveCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    availableRecruitNos: [],
    ...input,
  };
}

test("V1 strict season STATUS keeps canonical zero, one, and multiple-round results", () => {
  const empty = "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
  assert.equal(v1StrictSeasonReply(seasonSnapshot({ v1StrictLegacyReply: empty }), "STATUS"), empty);

  const oneRound = [
    "📢 내전하실분 #3", " 》협곡", " 》2026-09-11 21:00 시작", "👥 1/10명", "",
    "*참가 신청 양식*", "이름/현티어/최고티어/주라인/부라인", "EX) 1.지후/P/E/AD/MD", "",
    "1. 재현/M/M/TOP/SUP", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.",
  ].join("\n");
  assert.equal(v1StrictSeasonReply(seasonSnapshot({
    availableRecruitNos: [3],
    v1StrictLegacyReply: oneRound,
  }), "STATUS"), oneRound);

  const multipleRounds = [
    "[K-LOL.GG 내전현황]", "🔎 전체 명단: 내전상세 번호", "",
    "#3 2026-9-11 21:00 시작 (1/10)", "└ 내전상세 3",
    "#4 2026-9-11 21:00 시작 (2/10 / 예비 1)", "└ 내전상세 4", "",
    "상세 명령: 내전상세 3 / 내전상세 4",
  ].join("\n");
  assert.equal(v1StrictSeasonReply(seasonSnapshot({
    availableRecruitNos: [3, 4],
    v1StrictLegacyReply: multipleRounds,
  }), "STATUS"), multipleRounds);
});

test("V1 strict season DETAIL keeps the full existing form and empty missing result", () => {
  const existing = [
    "📢 내전하실분 #3", " 》협곡", " 》2026-09-11 21:00 시작", "👥 1/10명", "",
    "*참가 신청 양식*", "이름/현티어/최고티어/주라인/부라인", "EX) 1.지후/P/E/AD/MD", "",
    "1. 재현/M/M/TOP/SUP", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.",
  ].join("\n");
  assert.equal(v1StrictSeasonReply(seasonSnapshot({
    recruitNo: 3,
    availableRecruitNos: [3],
    v1StrictLegacyReply: existing,
  }), "DETAIL"), existing);
  assert.equal(v1StrictSeasonReply(seasonSnapshot({
    recruitNo: 404,
    v1StrictLegacyReply: "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.",
  }), "DETAIL"), "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.");
});
