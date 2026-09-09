import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { analyzeRhinoStatic } from "./lib/messengerbot-rhino-static.mjs";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const inputs = process.argv.slice(2);
const files = inputs.length > 0
  ? inputs
  : ["integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js"];
for (const input of files) {
  const file = resolve(process.cwd(), input);
  const source = await readFile(file, "utf8");
  const program = acorn.parse(source, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const findings = analyzeRhinoStatic(program);
  if (findings.statementCandidates.length > 0 || findings.unsafeSequenceOperands.length > 0 || findings.voidExpressions.length > 0 || findings.bareAssignmentConditions.length > 0) {
    console.error(`[rhino-static] blocked ${input}: warningCandidates=${findings.statementCandidates.length}, unsafeSequenceOperands=${findings.unsafeSequenceOperands.length}, voidExpressions=${findings.voidExpressions.length}, bareAssignmentConditions=${findings.bareAssignmentConditions.length}`);
    process.exitCode = 1;
  } else {
    console.log(`[rhino-static] passed ${input}: ES5, warningCandidates=0, unsafeSequenceOperands=0, voidExpressions=0, bareAssignmentConditions=0, characters=${source.length}`);
  }
}
