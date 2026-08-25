import assert from "node:assert/strict";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = String(process.env.KLOL_QA_BASE_URL || "https://k-lol-gg.vercel.app").replace(/\/$/, "");
const secret = process.env.KAKAO_RECRUIT_SECRET;
const roomName = "K 롤방 K롤방 공유& 문의 &건의 오픈톡방";
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

assert(secret, "KAKAO_RECRUIT_SECRET가 필요합니다.");

async function post(path, payload) {
  const endpoint = new URL(path, baseUrl);
  endpoint.searchParams.set("qa", `${runId}-${Date.now()}-${Math.random()}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-recruit-secret": secret },
    body: JSON.stringify({ roomName, ...payload }),
  });
  const body = await response.json();
  return { httpStatus: response.status, ...body };
}

async function managed(sender, message) {
  return post("/api/kakao/managed-forms", { sender, message });
}

function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [label, value]) => text.replace(new RegExp(`^${label}:.*$`, "m"), `${label}: ${value}`),
    template,
  );
}

const report = { runId, checks: [], created: [] };
function check(name, condition, detail) {
  assert(condition, `${name}: ${JSON.stringify(detail)}`);
  report.checks.push({ name, ok: true, detail });
}

const disciplineSender = `Codex API QA 경고 ${runId}`;
const disciplineForm = await managed(disciplineSender, "/경고");
check("경고 양식 호출", disciplineForm.formType === "DISCIPLINE" && disciplineForm.reply.includes("경고 부여 근거 사진 수: 0"), disciplineForm.reply);

const generalMessage = fill(disciplineForm.reply, {
  "대상 이름": `Codex일반QA${runId}`,
  "대상 닉네임#태그": `CodexGeneral${runId.slice(-4)}#QA01`,
  "경고 구분": "일반",
  "부여일": new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  "경고 부여 근거 사진 수": "0",
});
const general = await managed(disciplineSender, generalMessage);
check("일반 경고 0장 접수", general.publicCode?.startsWith("DS") && general.reply.includes("관리자 검토 대기"), general);
report.created.push({ type: "discipline-general", publicCode: general.publicCode });
const generalDuplicate = await managed(disciplineSender, generalMessage);
check("동일 경고 양식 중복 차단", generalDuplicate.reply.includes("이미 접수된 양식") && generalDuplicate.reply.includes(general.publicCode), generalDuplicate.reply);
const generalStatus = await managed(disciplineSender, `/경고현황 ${general.publicCode}`);
check("경고 접수 현황", generalStatus.reply.includes("PENDING_REVIEW"), generalStatus.reply);

const evidenceSender = `Codex API QA 근거 ${runId}`;
const evidenceMessage = fill(disciplineForm.reply, {
  "대상 이름": `Codex근거QA${runId}`,
  "대상 닉네임#태그": `CodexEvidence${runId.slice(-4)}#QA02`,
  "경고 구분": "내전",
  "부여일": new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  "경고 부여 근거 사진 수": "1",
});
const evidence = await managed(evidenceSender, evidenceMessage);
check("경고 근거 사진 세션", evidence.publicCode?.startsWith("DS") && evidence.reply.includes("30분 안에"), evidence);
report.created.push({ type: "discipline-evidence", publicCode: evidence.publicCode });
const invalidImage = await post("/api/kakao/image-receive", { sender: evidenceSender, mimeType: "image/png", base64Image: Buffer.from("not-an-image").toString("base64") });
check("잘못된 이미지 차단", invalidImage.statusCode === 500 && invalidImage.reply.includes("PNG, JPG 또는 WebP"), invalidImage.reply);

const invalidCountMessage = fill(disciplineForm.reply, {
  "대상 이름": `Codex오류QA${runId}`,
  "대상 닉네임#태그": `CodexInvalid${runId.slice(-4)}#QA03`,
  "경고 구분": "일반",
  "부여일": new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  "경고 부여 근거 사진 수": "4",
});
const invalidCount = await managed(`Codex API QA 오류 ${runId}`, invalidCountMessage);
check("근거 사진 0~3 경계", invalidCount.statusCode === 400 && invalidCount.reply.includes("0~3"), invalidCount.reply);

const inhouseTemplate = await managed(`Codex API QA 내전양식 ${runId}`, "/내전등록");
check("내전등록 양식 호출", inhouseTemplate.formType === "INHOUSE_RESULT" && inhouseTemplate.reply.includes("세트 수: 2/3"), inhouseTemplate.reply);
for (const gameCount of [2, 3]) {
  const sender = `Codex API QA 내전${gameCount} ${runId}`;
  const message = fill(inhouseTemplate.reply, {
    "진행일": new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
    "진행자": `CodexQA${gameCount}`,
    "세트 수": String(gameCount),
    "내전 회차": String(990000 + Number(runId.slice(-3)) + gameCount),
    "팀 밸런스 번호": "없음",
    "특이사항": `자동화 검증 ${runId}`,
  });
  const submission = await managed(sender, message);
  check(`내전 ${gameCount}세트 접수`, submission.publicCode?.startsWith("MR") && submission.reply.includes(`사진 ${gameCount}장`), submission);
  report.created.push({ type: `inhouse-${gameCount}`, publicCode: submission.publicCode });
  const status = await managed(sender, `/내전등록현황 ${submission.publicCode}`);
  check(`내전 ${gameCount}세트 현황`, status.reply.includes(`사진: 0/${gameCount}장`) && status.reply.includes("AWAITING_UPLOAD"), status.reply);
  const duplicate = await managed(sender, message);
  check(`내전 ${gameCount}세트 중복 차단`, duplicate.reply.includes("이미 접수된 양식"), duplicate.reply);
}

const generalResolution = await managed(`Codex API QA 인증 ${runId}`, "/경고인증 WR2DDB9EAE95");
check("일반 경고 차감 10장", generalResolution.reply.includes("0/10장") && generalResolution.reply.includes("남은 사진: 10장"), generalResolution.reply);

console.log(JSON.stringify(report, null, 2));
