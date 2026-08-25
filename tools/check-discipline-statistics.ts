import { buildDisciplineStatistics, type DisciplineStatisticsRecord } from "../src/lib/discipline/statistics";

const base = {
  userAccountId: 10,
  playerId: 20,
  targetName: "홍길동",
  targetNickname: "길동",
  targetTag: "KR1",
  player: { name: "홍길동", nickname: "길동", tag: "KR1" },
};
const records: DisciplineStatisticsRecord[] = [
  ...Array.from({ length: 7 }, () => ({ ...base, type: "CAUTION" })),
  { ...base, type: "WARNING" },
  { ...base, type: "BAN" },
  { userAccountId: null, playerId: null, targetName: "직접입력", targetNickname: "닉", targetTag: null, type: "CAUTION" },
];
const result = buildDisciplineStatistics(records);
const linked = result.find((person) => person.key === "player:20");
const direct = result.find((person) => person.name === "직접입력");

if (!linked || linked.rawCautions !== 7 || linked.cautionCount !== 7) throw new Error("활성 주의 횟수가 올바르지 않습니다.");
if (linked.warningCount !== 1 || linked.convertedWarnings !== 0 || linked.directWarnings !== 1) throw new Error("실제 경고 레코드 합계가 올바르지 않습니다.");
if (!linked.isBanned || result[0]?.key !== linked.key) throw new Error("밴 상태 또는 정렬 우선순위가 올바르지 않습니다.");
if (!direct || direct.nickname !== "닉" || direct.cautionCount !== 1) throw new Error("미등록 대상 집계가 올바르지 않습니다.");

console.log("Discipline statistics checks passed.");
