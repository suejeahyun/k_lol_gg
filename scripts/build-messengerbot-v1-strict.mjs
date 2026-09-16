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
  extracted.push(functionSource);
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
  " * V1 executable/comment lines are preserved; blank spacer lines are removed for the phone limit.",
  " */",
  `var KLOL_V1_SOURCE_SHA256 = "${sourceSha256Lf}";`,
  `var KLOL_V1_EXTRACTED_SHA256 = "${sha256(withoutBlankLines(withoutComments(extracted.join("\n\n"))))}";`,
  `var KLOL_V1_SOURCE_FUNCTIONS = ${compactStringArray(extractedNames)};`,
  `var KLOL_V1_TRANSPORT_SEAMS = ${compactStringArray([...transportSeamNames])};`
].join("\n");
const entry = [
  "function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {",
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
  "  var localText = String(msg || \"\");",
  "  if (localText.indexOf(\"들어왔습니다\") >= 0) return;",
  "  if (String(sender || \"\") === \"오픈채팅봇\" && localText.replace(/[ \\t]/g, \"\").indexOf(\"입장시할일\") >= 0) {",
  `    var joinTone = ${JSON.stringify(joinGuideTones)}[Math.floor(Math.random() * ${joinGuideTones.length})];`,
  `    sourceReplier.reply(joinTone[0] + ${JSON.stringify(joinGuideCore)} + joinTone[1]);`,
  "    return;",
  "  }",
  "  KLOL_V1_OPERATION_RAW_TEXT = String(msg || \"\");",
  "  try {",
  "    if (/^\\/?(?:내전|스크림)[ \\t]+[1-9]\\d{0,2}[ \\t]*ㅉ$/.test(msg)) {",
  "      handlePartyRecruitApi(\"\", room, msg, sender, guardedReplier, \"\", msg.indexOf(\"내전\") >= 0 ? \"FEATURES\" : \"RECRUIT\");",
  "      return;",
  "    }",
  "    if (handleMemberMutationCommand(msg, room, sender, guardedReplier)) return;",
  "    v1SourceResponse(room, msg, sender, isGroupChat, guardedReplier, imageDB, packageName);",
  "  } finally {",
  "    KLOL_V1_OPERATION_RAW_TEXT = \"\";",
  "  }",
  "}",
  "response.__kakaoBotEntryPoint = true;"
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
  "var v1PartyHelp = getPartyRecruitHelpNotice;",
  "getPartyRecruitHelpNotice = function () {",
  "  return v1PartyHelp().replace(",
  "    \"현황: 구인현황\\n종료: 번호ㅉ\",",
  "    \"활성화: 주최자 입력 후 전체 전송 (시간·게임은 비우면 자동)\\n현황: 구인현황\\n추가: 상세 번호 추가 이름\\n삭제: 상세 번호 삭제 이름\\n종료: 번호ㅉ\"",
  "  );",
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
if (!output.includes("msg.indexOf(\"내전\") >= 0 ? \"FEATURES\" : \"RECRUIT\"")) {
  throw new Error("V1-strict output must route scoped in-house and scrim finish commands");
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
if (!output.includes("추가: 상세 번호 추가 이름") || !output.includes("삭제: 상세 번호 삭제 이름")) {
  throw new Error("V1-strict output must document the approved party member mutation commands");
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
