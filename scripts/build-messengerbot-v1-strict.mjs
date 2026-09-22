import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeRhinoStatic } from "./lib/messengerbot-rhino-static.mjs";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "integrations/messengerbot-r/v1-strict");
const sourceCommit = "4f84e84aa0a4ee986c2aad2c7377d8e3bcf2e097";
const sourcePath = "KLOL_KAKAO_BOT_V40_GUIDED_HUB.js";
const sourceSha256Lf = "0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2";
const sourceSha256Crlf = "c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7";
const fixturePath = resolve(root, "tests/fixtures/kakao/v1", sourcePath);
const outputName = "KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js";
const joinGuideCore = "\n\n1️⃣ 닉네임\n👋 년도 본명 닉네임 티어(22년 이후 최고티어)\n예시) 98 영훈 탑갱와줘요오 U(G)\n띄어쓰기 확인!\n\n2️⃣ 구인구직방\n🔗 https://open.kakao.com/o/gAxaVdxh\n🔐 참여코드: 7942\n• 구인 글 외 대화 자제하기\n• 소통방과 같은 닉네임 사용하기\n\n3️⃣ 디스코드\n🔗 https://discord.gg/k-lol\n\n";
const joinGuideTones = [
  ["💜 반가워요! K-LOL에 오신 걸 환영해요 😊", "앞으로 즐겁게 함께해요 💕"],
  ["📌 K-LOL 안내", "확인 감사합니다. 즐거운 시간 보내세요."],
  ["🎮 K-LOL 합류 준비 완료!", "준비 끝! 오늘도 즐겜해요 🔥"],
  ["😎 입장 전 간단 퀘스트!", "퀘스트 완료! 같이 달려봐요 🎉"],
];

const selectedFunctionNames = new Set([
  "isKlolBotEchoSender",
  "isKlolServerEchoMessage",
  "response",
  "isScrimRecruitFormMessageForBot",
  "isScrimRecruitCommand",
  "getScrimRecruitApiUrl",
  "handleScrimRecruitCommand",
  "isLolKCommand",
  "isRecruitCommand",
  "handleLolKCommand",
  "handleRecruitCommand",
  "isSeasonRecruitTemplateCommand",
  "isSeasonRecruitStatusCommand",
  "isPartyRecruitLikeMessage",
  "isSeasonApplyFormMessage",
  "hasSeasonApplySlash",
  "hasSeasonApplyWord",
  "hasSeasonApplyForm",
  "countFilledSeasonApplyLines",
  "isBadSeasonApplyName",
  "isSeasonApplyExampleLine",
  "isPartyRecruitWebHelperCommand",
  "isPartyRecruitHelpCommand",
  "isPartyRecruitStatusCommand",
  "isPartyRecruitCreateCommand",
  "isPartyRecruitFinishCommand",
  "hasPartyRecruitNumber",
  "isPartyRecruitFormWithoutNumber",
  "isPartyRecruitFormMessage",
  "handlePartyRecruitSync",
  "getParticipationGuideNotice",
  "getPartyRecruitWebHelperNotice",
  "getPartyRecruitHelpNotice",
  "getUnifiedHelpNotice",
  "stripOperationLinePrefix",
  "canonicalOperationText",
  "escapeOperationRegExp",
  "makeOperationLabelRegex",
  "lineStartsWithOperationLabel",
  "removeOperationLabelPrefix",
  "includesAllKeywords",
  "isOperationNextLabelLine",
  "readOperationField",
  "cleanOperationField",
  "hasRealOperationValue",
  "detectOperationFormType",
  "isOperationFormMessage",
  "normalizeText",
  "trimText",
  "normalizeCommandText",
  "makeHash",
  "isRegistrationHubCommand",
  "isGuidedRegistrationShortcut",
  "getRegistrationHubNotice",
  "getGuidedInhouseRegistrationNotice",
  "getGuidedDisciplineRegistrationNotice",
  "getGuidedEvidenceNotice",
  "getGuidedDisciplineStatusNotice",
  "getGuidedInhouseStatusNotice",
  "handleGuidedRegistrationShortcut",
  "handleSiteFirstManagedWorkflow",
  "isManagedWorkflowMessage",
  "isImagePlaceholderMessage"
]);
const transportSeamNames = new Set([
  "sendSearchPlayerCommand",
  "sendOpenchatCommand",
  "fetchSeasonRecruitStatusText",
  "handleSeasonApplyMessage",
  "handlePartyRecruitApi",
  "fetchPartyRecruitStatusText",
  "handleOperationFormMessage",
  "handleManagedImage",
  "replyManagedImageFallback"
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function withoutBlankLines(value) {
  return value
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function withoutComments(value) {
  const comments = [];
  acorn.parse(value, {
    ecmaVersion: 5,
    allowReserved: true,
    preserveParens: true,
    onComment: comments,
  });
  let output = value;
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    const newlineCount = (output.slice(comment.start, comment.end).match(/\n/gu) ?? []).length;
    output = `${output.slice(0, comment.start)} ${"\n".repeat(newlineCount)}${output.slice(comment.end)}`;
  }
  return output;
}

function compactBundleSource(value) {
  return value.replace(/^[ \t]+/gmu, "");
}

function compactStringArray(values) {
  const rows = [];
  for (let index = 0; index < values.length; index += 24) {
    rows.push(values.slice(index, index + 24).map((value) => JSON.stringify(value)).join(","));
  }
  return `[${rows.join(",\n")}]`;
}

const source = await readFile(fixturePath, "utf8");
if (sha256(source) !== sourceSha256Lf) {
  throw new Error("Canonical V1 source hash mismatch");
}

const sourceProgram = acorn.parse(source, {
  ecmaVersion: 5,
  allowReserved: true,
  preserveParens: true
});
const canonicalFunctions = new Map(
  sourceProgram.body
    .filter((node) => node.type === "FunctionDeclaration")
    .map((node) => [node.id.name, node])
);

function identifierCalls(node, output = new Set()) {
  if (!node || typeof node !== "object") return output;
  if (node.type === "CallExpression" && node.callee.type === "Identifier") output.add(node.callee.name);
  for (const [key, value] of Object.entries(node)) {
    if (key === "start" || key === "end" || key === "loc") continue;
    if (Array.isArray(value)) {
      for (const item of value) identifierCalls(item, output);
    } else if (value && typeof value === "object") {
      identifierCalls(value, output);
    }
  }
  return output;
}

function responseReachableFunctions() {
  const reachable = new Set();
  const queue = ["response"];
  while (queue.length > 0) {
    const name = queue.shift();
    if (reachable.has(name)) continue;
    reachable.add(name);
    if (transportSeamNames.has(name)) continue;
    const node = canonicalFunctions.get(name);
    if (!node) continue;
    for (const calledName of identifierCalls(node)) {
      if (canonicalFunctions.has(calledName) && !reachable.has(calledName)) queue.push(calledName);
    }
  }
  return reachable;
}

const responseReachable = responseReachableFunctions();
const requiredOriginalFunctions = new Set(
  [...responseReachable].filter((name) => !transportSeamNames.has(name))
);
const missingReachable = [...requiredOriginalFunctions].filter((name) => !selectedFunctionNames.has(name));
const unreachableSelected = [...selectedFunctionNames].filter((name) => !requiredOriginalFunctions.has(name));
if (missingReachable.length > 0 || unreachableSelected.length > 0) {
  throw new Error(
    `Canonical V1 response call graph drift: missing=${missingReachable.join(",") || "none"}; ` +
    `unreachable=${unreachableSelected.join(",") || "none"}`
  );
}
for (const seam of transportSeamNames) {
  if (!responseReachable.has(seam)) throw new Error(`Configured V1 transport seam is not response-reachable: ${seam}`);
}
const extracted = [];
const extractedNames = [];
for (const node of sourceProgram.body) {
  if (node.type !== "FunctionDeclaration" || !selectedFunctionNames.has(node.id.name)) continue;
  let functionSource = source.slice(node.start, node.end);
  if (node.id.name === "response") {
    functionSource = functionSource.replace(/^function response\s*\(/u, "function v1SourceResponse(");
  }
  extracted.push(compactBundleSource(functionSource));
  extractedNames.push(node.id.name);
}

const missing = [...selectedFunctionNames].filter((name) => !extractedNames.includes(name));
if (missing.length > 0) throw new Error(`Missing canonical V1 functions: ${missing.join(", ")}`);

const transport = compactBundleSource(await readFile(resolve(directory, "KLOL_KAKAO_BOT_V1_STRICT_TRANSPORT.js"), "utf8"))
  .replace(/\r\n?/gu, "\n")
  .trim();
const adapter = compactBundleSource(await readFile(resolve(directory, "KLOL_KAKAO_BOT_V1_STRICT_ADAPTER.js"), "utf8"))
  .replace(/\r\n?/gu, "\n")
  .trim();
const provenance = [
  "/* GENERATED by scripts/build-messengerbot-v1-strict.mjs.",
  ` * Canonical V1: ${sourceCommit}:${sourcePath}`,
  ` * Canonical SHA-256 (Git LF blob): ${sourceSha256Lf}`,
  ` * User-provided CRLF SHA-256: ${sourceSha256Crlf}`,
  " * V1 executable code is preserved; leading indentation and blank lines are removed for the phone limit.",
  " */",
  `var KLOL_V1_SOURCE_SHA256 = "${sourceSha256Lf}";`,
  `var KLOL_V1_EXTRACTED_SHA256 = "${sha256(withoutBlankLines(withoutComments(extracted.join("\n\n"))))}";`,
  `var KLOL_V1_SOURCE_FUNCTIONS = ${compactStringArray(extractedNames)};`,
  `var KLOL_V1_TRANSPORT_SEAMS = ${compactStringArray([...transportSeamNames])};`
].join("\n");
const entry = [
  "function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {",
  "  var localText = String(msg || \"\");",
  "  var diagnostic = normalizeCommandText(localText.replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\"));",
  "  if (/^\\/?봇(?:속도|버전|진단)$/.test(diagnostic)) {",
  "    if (isKlolBotEchoSender(sender)) return;",
  "    botDiagLog(\"RECEIVED\");",
  "    try {",
  "      botDiagLog(replier.reply(\"[K-LOL.GG 카카오봇 코드 버전]\\n\" + BOT_CODE_VERSION + \"\\n\\n\" + KLOL_V1_GATEWAY.speed()) === false ? \"REJECTED\" : \"RETURNED\");",
  "    } catch (ignoredDiagnosticReply) { botDiagLog(\"REPLY_ERROR\"); }",
  "    return;",
  "  }",
  "  KLOL_V1_GATEWAY.beginRequest(logId, userHash, sender);",
  "  if (isOpenChatBotInhouseLoadingNotice(msg, sender)) return;",
  "  var sourceReplier = replier;",
  "  var guardedReplier = {",
  "    reply: function (value) {",
  "      if (KLOL_V1_GATEWAY.shouldSuppressReply()) return;",
  "      sourceReplier.reply(value);",
  "      KLOL_V1_GATEWAY.markReplySent();",
  "    }",
  "  };",
  "  if (isRetiredScrimInput(localText)) {",
  "    if (!isKlolBotEchoSender(sender)) guardedReplier.reply(\"[K-LOL.GG 스크림 기능 종료]\\n카카오톡 스크림 기능은 종료되었습니다.\\n파티는 5인파티, 내전은 내전구인을 입력해 주세요.\");",
  "    return;",
  "  }",
  "  if (localText.indexOf(\"들어왔습니다\") >= 0) return;",
  "  if (String(sender || \"\") === \"오픈채팅봇\" && localText.replace(/[ \\t]/g, \"\").indexOf(\"입장시할일\") >= 0) {",
  `    var joinTone = ${JSON.stringify(joinGuideTones)}[Math.floor(Math.random() * ${joinGuideTones.length})];`,
  `    sourceReplier.reply(joinTone[0] + ${JSON.stringify(joinGuideCore)} + joinTone[1]);`,
  "    return;",
  "  }",
  "  KLOL_V1_OPERATION_RAW_TEXT = String(msg || \"\");",
  "  try {",
  "    if (handleCopyRosterForm(msg, room, sender, guardedReplier)) return;",
  "    if (/^\\/?내전[ \\t]+[1-9]\\d{0,2}[ \\t]*ㅉ$/.test(msg)) {",
  "      handlePartyRecruitApi(\"\", room, msg, sender, guardedReplier, \"\", \"FEATURES\");",
  "      return;",
  "    }",
  "    if (handleMemberMutationCommand(msg, room, sender, guardedReplier)) return;",
  // The legacy response probes images synchronously before routing commands.
  // Text notifications do not need image extraction; retain actual image input.
  "    var messageText = trimText(normalizeText(localText));",
  "    var messageImage = messageText === \"\" || isImagePlaceholderMessage(messageText) ? imageDB : null;",
  "    v1SourceResponse(room, msg, sender, isGroupChat, guardedReplier, messageImage, packageName);",
  "  } finally {",
  "    KLOL_V1_OPERATION_RAW_TEXT = \"\";",
  "    KLOL_V1_GATEWAY.finish();",
  "  }",
  "}",
].map((line) => line.startsWith("  ") ? line.slice(2) : line).join("\n");
const operationCandidateBinding = [
  "var isOperationFormCompleteMessage = isOperationFormMessage;",
  "isOperationFormMessage = isOperationFormCandidateMessage;",
].map((line) => line.startsWith("  ") ? line.slice(2) : line).join("\n");
const seasonCandidateBinding = [
  "/* Keep V1 routing, but let recoverable numbered rows reach the V4 row parser. */",
  "var isSeasonApplyCompleteMessage = isSeasonApplyFormMessage;",
  "isSeasonApplyFormMessage = isSeasonApplyCandidateMessage;",
  "function isPartyMetadataActivationForm(text) {",
  "  text = normalizeText(String(text || \"\"));",
  "  return hasPartyRecruitNumber(text) && isPartyRecruitLikeMessage(text) &&",
  "    /^\\s*[》>]?\\s*시작\\s*시간\\s*[:：]?/m.test(text) &&",
  "    /^\\s*[》>]?\\s*게임\\s*정보\\s*[:：]?/m.test(text) &&",
  "    /^\\s*[》>]?\\s*주\\s*최\\s*자\\s*[:：]?/m.test(text);",
  "}",
  "/* A structurally in-house snapshot must never fall through to PARTY_SYNC. */",
  "var isPartyRecruitFormMessageWithoutSeasonSnapshot = isPartyRecruitFormMessage;",
  "isPartyRecruitFormMessage = function (text) {",
  "  if (isSeasonApplySnapshotEnvelope(text)) return false;",
  "  return isPartyRecruitFormMessageWithoutSeasonSnapshot(text) || isPartyMetadataActivationForm(text);",
  "};",
].map((line) => line.startsWith("  ") ? line.slice(2) : line).join("\n");
const recruitHelpBinding = [
  "getPartyRecruitHelpNotice = function () {",
  "  return \"[K-LOL.GG 구인 도움말]\\n\\n참가하기\\n1. 최근 봇 명단 전체 복사\\n2. 빈칸에 내 이름 입력\\n3. 메시지 전체 전송 = 저장\\n\\n\" +",
  "    \"협곡: 이름/top,mid 또는 이름/all\\n칼바람·증바람: 이름만 입력\\n회원 연결은 접수 후 진행합니다.\\n저장 결과를 확인하고 다음 사람은 새 명단을 복사해 주세요.\\n양식코드와 번호는 그대로 두세요.\\n\\n\" +",
  "    \"새 모집 만들기\\n파티: 5인파티 / 내전: 내전구인\\n\\n\" +",
  "    \"파티: 구인현황 / 상세 번호 / 종료: 번호ㅉ\\n내전: 내전현황 / 내전상세 번호 / 종료: 내전 번호ㅉ\\n오전 6시 내전 자동 종료\\n\\n\" +",
  "    \"취소·수정\\nN인파티: 양식에서 이름 추가·삭제·교체, 시작·게임 수정\\n내전: 최신 양식에서 이름·라인·시간 수정\\n삭제: 번호 행을 남기고 이름만 비우기\\n사이트 신청·운영진 확정 항목은 보호됩니다.\\n상세 번호 추가/삭제 이름\\n내전상세 번호 추가/삭제 이름\\n내전상세 번호 수정/예비추가/예비삭제 이름/라인\\n\\n저장 상태 확인: 상세 번호 / 내전상세 번호로 다시 조회\";",
  "};",
  "var v1UnifiedHelp = getUnifiedHelpNotice;",
  "getUnifiedHelpNotice = function () {",
  "  return v1UnifiedHelp().replace(\"LOL-K 기능\", \"파티·내전 참가\\n최근 봇 명단 전체 복사 → 빈칸에 내 이름 입력 → 메시지 전체 전송 = 저장\\n협곡: 이름/top,mid 또는 이름/all\\n칼바람·증바람: 이름만 입력\\n회원 연결은 접수 후 진행합니다.\\nN인파티 이름·시작·게임 / 내전 이름·라인·시간: 최신 양식 수정\\n사이트 신청·운영진 확정 항목은 보호됩니다.\\n저장 상태 확인: 상세 번호 / 내전상세 번호로 다시 조회\\n새 모집 만들기: 5인파티 / 내전구인\\n자세한 사용법: 구인도움말\\n\\nLOL-K 기능\")",
  "    .replace(\"구인구직 명령어는 구인도움말을 입력해주세요.\\n스크림구인은 /스크림구인, /스크림현황을 사용해주세요.\\n\\n\", \"\");",
  "};",
  "getParticipationGuideNotice = function () {",
  "  return \"[K-LOL.GG 내전 참가 방법 안내]\\n\\n1. 최근 봇 명단 전체 복사\\n2. 빈칸에 내 이름 입력\\n3. 메시지 전체 전송 = 저장\\n\\n\" +",
  "    \"협곡: 이름/top,mid 또는 이름/all\\n칼바람·증바람: 이름만 입력\\n회원 연결은 접수 후 진행합니다.\\n최신 양식에서 이름·라인·시간 수정\\n삭제: 번호 행을 남기고 이름만 비우기\\n사이트 신청·운영진 확정 항목은 보호됩니다.\\n양식코드·번호 유지\\n저장 상태 확인: 내전상세 번호로 다시 조회\\n새 모집 만들기: 내전구인\\n취소: 내전상세 번호 삭제 이름\\n라인 수정: 내전상세 번호 수정 이름/top,mid\";",
  "};",
].map((line) => line.startsWith("  ") ? line.slice(2) : line).join("\n");
const uncompressedOutput = `${provenance}\n\n${transport}\n\n${adapter}\n\n${extracted.join("\n\n")}\n\n${operationCandidateBinding}\n${seasonCandidateBinding}\n${recruitHelpBinding}\n\n${entry}\n`;
// The canonical V1 source contains many blank spacer lines. MessengerBot R may
// store pasted LF text as CRLF, so remove only blank lines while preserving
// every executable/comment line and the human-readable layout.
const output = `${withoutBlankLines(withoutComments(uncompressedOutput))}\n`;
const outputComments = [];
const program = acorn.parse(output, {
  ecmaVersion: 5,
  allowReserved: true,
  preserveParens: true,
  onComment: outputComments,
});
const findings = analyzeRhinoStatic(program);
const responseCount = output.match(/function\s+response\s*\(/gu)?.length ?? 0;
const connectCount = output.match(/org\.jsoup\.Jsoup\.connect\s*\(/gu)?.length ?? 0;
const bannedTransport = [
  "/api/kakao/party-recruits/",
  "/api/kakao/destruction-scrim-recruits/",
  "/api/kakao/recruit/season-apply",
  "/api/kakao/openchat",
  "/api/kakao/search-player",
  "Authorization",
  "Bearer ",
  "x-kakao-recruit-secret"
];

if (responseCount !== 1) throw new Error("V1-strict output must define exactly one response callback");
if (connectCount !== 1) throw new Error("V1-strict output must contain exactly one HTTP boundary");
if (outputComments.length !== 0) throw new Error("V1-strict output must not contain JavaScript comments");
if (!output.includes(".timeout(5000)")) throw new Error("V1-strict transport must use the five-second timeout");
if (!output.includes("var isOperationFormCompleteMessage = isOperationFormMessage;")) {
  throw new Error("V1-strict output must preserve the operation-form completion predicate");
}
if (!output.includes("isOperationFormMessage = isOperationFormCandidateMessage;")) {
  throw new Error("V1-strict output must route incomplete operation-form candidates");
}
if (!output.includes("isSeasonApplyFormMessage = isSeasonApplyCandidateMessage;")) {
  throw new Error("V1-strict output must route recoverable season-application candidates");
}
if (!output.includes("function isCompleteEmptySeasonApplySnapshot(text)")) {
  throw new Error("V1-strict output must route a complete empty season snapshot for authoritative cancellation");
}
if (!output.includes("function isSeasonApplySnapshotEnvelope(text)")) {
  throw new Error("V1-strict output must identify in-house snapshots before party-form routing");
}
if (!output.includes("isPartyRecruitFormMessageWithoutSeasonSnapshot")) {
  throw new Error("V1-strict output must exclude in-house snapshots from party-form routing");
}
if (!output.includes("function isPartyMetadataActivationForm(text)")) {
  throw new Error("V1-strict output must route metadata-only party activation forms");
}
if (!output.includes("if (isRetiredScrimInput(localText))") || !output.includes("function isRetiredScrimInput(value)")) {
  throw new Error("R24 must retire scrim commands and forms before the legacy router");
}
if (!output.includes("if (handleCopyRosterForm(msg, room, sender, guardedReplier)) return;")) {
  throw new Error("R24 must route compact copy forms before the legacy router");
}
if (!output.includes("if (handleMemberMutationCommand(msg, room, sender, guardedReplier)) return;")) {
  throw new Error("V1-strict output must route explicit member mutations before the V1 dispatcher");
}
if (!output.includes("if (isOpenChatBotInhouseLoadingNotice(msg, sender)) return;")) {
  throw new Error("V1-strict output must ignore the OpenChat bot's in-house loading notice");
}
if (!output.includes("if (KLOL_V1_GATEWAY.shouldSuppressReply()) return;") ||
    !output.includes("KLOL_V1_GATEWAY.markReplySent();")) {
  throw new Error("V1-strict output must suppress only callbacks whose visible reply was already sent");
}
if (!output.includes("상세 번호 추가/삭제 이름") ||
    !output.includes("내전상세 번호 수정/예비추가/예비삭제 이름/라인")) {
  throw new Error("V1-strict output must keep mutation guidance inside recruit help");
}
if (output.length >= 65_535) throw new Error("V1-strict LF output exceeds MessengerBot R's 65,535-character limit");
const crlfLength = output.replace(/\n/gu, "\r\n").length;
if (crlfLength >= 65_535) throw new Error(`V1-strict CRLF output is ${crlfLength} characters and exceeds MessengerBot R's 65,535-character limit`);
if (Math.max(...output.split("\n").map((line) => line.length)) > 1_000) {
  throw new Error("V1-strict output contains an unreadably long line");
}
for (const value of bannedTransport) {
  if (output.includes(value)) throw new Error(`V1-strict output retained banned legacy transport material: ${value}`);
}
if (
  findings.statementCandidates.length ||
  findings.unsafeSequenceOperands.length ||
  findings.voidExpressions.length ||
  findings.bareAssignmentConditions.length ||
  findings.inconsistentReturnFunctions.length
) {
  throw new Error("V1-strict output contains Rhino static warning candidates");
}

await writeFile(resolve(directory, outputName), output, "utf8");
console.log(
  `Generated integrations/messengerbot-r/v1-strict/${outputName} ` +
  `(${output.length} LF characters, ${crlfLength} CRLF characters, source=${sourceSha256Lf}, functions=${extractedNames.length})`
);
