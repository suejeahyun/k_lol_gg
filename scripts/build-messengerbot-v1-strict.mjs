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

const transport = (await readFile(resolve(directory, "KLOL_KAKAO_BOT_V1_STRICT_TRANSPORT.js"), "utf8"))
  .replace(/\r\n?/gu, "\n")
  .trim();
const adapter = (await readFile(resolve(directory, "KLOL_KAKAO_BOT_V1_STRICT_ADAPTER.js"), "utf8"))
  .replace(/\r\n?/gu, "\n")
  .trim();
const provenance = [
  "/* GENERATED by scripts/build-messengerbot-v1-strict.mjs.",
  ` * Canonical V1: ${sourceCommit}:${sourcePath}`,
  ` * Canonical SHA-256 (Git LF blob): ${sourceSha256Lf}`,
  ` * User-provided CRLF SHA-256: ${sourceSha256Crlf}`,
  " * V1 executable/comment lines are preserved; blank spacer lines are removed for the phone limit.",
  " */",
  `var KLOL_V1_SOURCE_COMMIT = "${sourceCommit}";`,
  `var KLOL_V1_SOURCE_SHA256 = "${sourceSha256Lf}";`,
  `var KLOL_V1_EXTRACTED_SHA256 = "${sha256(withoutBlankLines(extracted.join("\n\n")))}";`,
  "var KLOL_V1_SOURCE_FUNCTIONS = [",
  extractedNames.map((name) => `  "${name}"`).join(",\n"),
  "];",
  "var KLOL_V1_TRANSPORT_SEAMS = [",
  [...transportSeamNames].map((name) => `  "${name}"`).join(",\n"),
  "];"
].join("\n");
const entry = [
  "function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {",
  "  KLOL_V1_GATEWAY.beginRequest(logId, userHash, sender);",
  "  KLOL_V1_OPERATION_RAW_TEXT = String(msg || \"\");",
  "  try {",
  "    v1SourceResponse(room, msg, sender, isGroupChat, replier, imageDB, packageName);",
  "  } finally {",
  "    KLOL_V1_OPERATION_RAW_TEXT = \"\";",
  "  }",
  "}",
  "response.__kakaoBotEntryPoint = true;"
].join("\n");
const operationCandidateBinding = [
  "/* Preserve the byte-derived completion predicate for diagnostics, but route candidates to V4. */",
  "var isOperationFormCompleteMessage = isOperationFormMessage;",
  "isOperationFormMessage = isOperationFormCandidateMessage;",
].join("\n");
const seasonCandidateBinding = [
  "/* Keep V1 routing, but let recoverable numbered rows reach the V4 row parser. */",
  "var isSeasonApplyCompleteMessage = isSeasonApplyFormMessage;",
  "isSeasonApplyFormMessage = isSeasonApplyCandidateMessage;",
  "/* A structurally in-house snapshot must never fall through to PARTY_SYNC. */",
  "var isPartyRecruitFormMessageWithoutSeasonSnapshot = isPartyRecruitFormMessage;",
  "isPartyRecruitFormMessage = function (text) {",
  "  if (isSeasonApplySnapshotEnvelope(text)) return false;",
  "  return isPartyRecruitFormMessageWithoutSeasonSnapshot(text);",
  "};",
].join("\n");
const uncompressedOutput = `${provenance}\n\n${transport}\n\n${adapter}\n\n${extracted.join("\n\n")}\n\n${operationCandidateBinding}\n${seasonCandidateBinding}\n\n${entry}\n`;
// The canonical V1 source contains many blank spacer lines. MessengerBot R may
// store pasted LF text as CRLF, so remove only blank lines while preserving
// every executable/comment line and the human-readable layout.
const output = `${withoutBlankLines(uncompressedOutput)}\n`;
const program = acorn.parse(output, {
  ecmaVersion: 5,
  allowReserved: true,
  preserveParens: true
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
if (output.length >= 65_535) throw new Error("V1-strict LF output exceeds MessengerBot R's 65,535-character limit");
const crlfLength = output.replace(/\n/gu, "\r\n").length;
if (crlfLength >= 65_535) throw new Error("V1-strict CRLF output exceeds MessengerBot R's 65,535-character limit");
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
  findings.bareAssignmentConditions.length
) {
  throw new Error("V1-strict output contains Rhino static warning candidates");
}

await writeFile(resolve(directory, outputName), output, "utf8");
console.log(
  `Generated integrations/messengerbot-r/v1-strict/${outputName} ` +
  `(${output.length} LF characters, ${crlfLength} CRLF characters, source=${sourceSha256Lf}, functions=${extractedNames.length})`
);
