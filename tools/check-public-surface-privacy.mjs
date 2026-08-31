import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  {
    policy: "PUBLIC_PLAYER_RAW_ROW",
    file: "src/app/(user)/progress/destruction/[tournamentId]/page.tsx",
    pattern: /(?:player|mvpPlayer):\s*true/g,
  },
  {
    policy: "PUBLIC_PLAYER_REAL_NAME",
    file: "src/app/(user)/progress/destruction/[tournamentId]/page.tsx",
    pattern: /(?:player|mvpPlayer)\.name/g,
  },
  {
    policy: "PUBLIC_MVP_REAL_NAME",
    file: "src/components/destruction/DestructionMvpVoteHub.tsx",
    pattern: /(?:participant\.player|match\.mvpPlayer)\.name/g,
  },
  {
    policy: "PUBLIC_RECRUIT_PRIVATE_FIELD",
    file: "src/app/app/recruits/page.tsx",
    pattern: /(?:member\.name|party\.(?:hostName|roomName))/g,
  },
];

const violations = [];
for (const check of checks) {
  const source = fs.readFileSync(path.join(root, check.file), "utf8");
  for (const match of source.matchAll(check.pattern)) {
    violations.push({
      policy: check.policy,
      file: check.file,
      line: source.slice(0, match.index).split(/\r?\n/).length,
    });
  }
}

if (violations.length > 0) {
  console.error(`[public-surface] FAIL: ${violations.length} forbidden public data paths`);
  for (const violation of violations) {
    console.error(`${violation.policy} ${violation.file}:${violation.line}`);
  }
  process.exit(1);
}

console.log("[public-surface] PASS: forbidden public data paths 0");
