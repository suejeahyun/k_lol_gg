process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
async function main() {
const { DEFAULT_MANAGED_TEMPLATES, parseKstDateOnly, parseManagedForm, parseNicknameTag, renderManagedTemplate } = await import("../src/lib/kakao/managed-forms");

const discipline = DEFAULT_MANAGED_TEMPLATES.DISCIPLINE;
const rendered = renderManagedTemplate(discipline);
if (rendered.includes("경고 사유:")) throw new Error("경고 사유가 카카오 양식에 노출되면 안 됩니다.");
const disciplineDefaults = renderManagedTemplate(discipline, {
  issuedDate: "2026-08-31",
  evidenceImageCount: "0",
});
if (!disciplineDefaults.includes("부여일: 2026-08-31") || !disciplineDefaults.includes("경고 부여 근거 사진 수: 0")) {
  throw new Error("경고 양식 자동 입력값을 표시하지 못했습니다.");
}
const filled = rendered
  .replace("대상 이름:", "대상 이름: 정민")
  .replace("대상 닉네임#태그:", "대상 닉네임#태그: 닉네임#KR1")
  .replace("경고 구분:", "경고 구분: 내전")
  .replace("부여일: YYYY-MM-DD", "부여일: 2026-08-25")
  .replace("경고 부여 근거 사진 수: 0", "경고 부여 근거 사진 수: 2");
const parsed = parseManagedForm(filled, discipline);
if (!parsed.ok || parsed.values.warningCategory !== "내전") throw new Error("경고 양식 파싱에 실패했습니다.");
const zeroEvidence = parseManagedForm(rendered
  .replace("대상 이름:", "대상 이름: 정민")
  .replace("대상 닉네임#태그:", "대상 닉네임#태그: 닉네임#KR1")
  .replace("경고 구분:", "경고 구분: 일반")
  .replace("부여일: YYYY-MM-DD", "부여일: 2026-08-25"), discipline);
if (!zeroEvidence.ok || zeroEvidence.values.evidenceImageCount !== "0") throw new Error("경고 근거 사진 0장 양식 파싱에 실패했습니다.");
if (!parseNicknameTag("닉네임#KR1") || parseNicknameTag("닉네임") !== null) throw new Error("닉네임#태그 검증에 실패했습니다.");
if (!parseKstDateOnly("2026-08-25") || parseKstDateOnly("2026-02-31") !== null) throw new Error("날짜 검증에 실패했습니다.");

const inhouse = DEFAULT_MANAGED_TEMPLATES.INHOUSE_RESULT;
const inhouseDefaults = renderManagedTemplate(inhouse, {
  matchDate: "2026-08-31",
  organizer: "진행자",
  note: "없음",
});
if (!inhouseDefaults.includes("진행일: 2026-08-31") || !inhouseDefaults.includes("진행자: 진행자") || !inhouseDefaults.includes("특이사항: 없음")) {
  throw new Error("내전 결과 양식 자동 입력값을 표시하지 못했습니다.");
}
const inhouseText = renderManagedTemplate(inhouse)
  .replace("진행일: YYYY-MM-DD", "진행일: 2026-08-25")
  .replace("진행자:", "진행자: 관리자")
  .replace("세트 수: 2/3", "세트 수: 3")
  .replace("내전 회차:", "내전 회차: 2")
  .replace("팀 밸런스 번호: 없음", "팀 밸런스 번호: 없음")
  .replace("특이사항: 없음", "특이사항: 없음");
if (!parseManagedForm(inhouseText, inhouse).ok) throw new Error("내전 결과 양식 파싱에 실패했습니다.");
console.log("Kakao managed form checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
