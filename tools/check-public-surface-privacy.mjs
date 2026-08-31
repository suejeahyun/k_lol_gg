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
  {
    policy: "PUBLIC_EVENT_API_RAW_PLAYER",
    file: "src/app/api/event-matches/[eventId]/route.ts",
    pattern: /(?:player|captain):\s*true/g,
  },
  {
    policy: "PUBLIC_DESTRUCTION_API_RAW_PLAYER",
    file: "src/app/api/destruction-tournaments/[tournamentId]/route.ts",
    pattern: /(?:player|captain):\s*true/g,
  },
  {
    policy: "PUBLIC_MATCH_API_RAW_PLAYER",
    file: "src/app/api/matches/[matchId]/route.impl.ts",
    pattern: /player:\s*true/g,
  },
];

const requiredChecks = [
  {
    policy: "PUBLIC_EVENT_MEMBER_DTO_MISSING",
    file: "src/app/api/event-matches/[eventId]/route.ts",
    pattern: /player:\s*toPublicPlayerSummaryDto\(member\.player\)/,
  },
  {
    policy: "PUBLIC_EVENT_PARTICIPANT_DTO_MISSING",
    file: "src/app/api/event-matches/[eventId]/route.ts",
    pattern: /player:\s*toPublicPlayerSummaryDto\(participant\.player\)/,
  },
  {
    policy: "PUBLIC_DESTRUCTION_CAPTAIN_DTO_MISSING",
    file: "src/app/api/destruction-tournaments/[tournamentId]/route.ts",
    pattern: /captain:\s*toPublicPlayerSummaryDto\(team\.captain\)/,
  },
  {
    policy: "PUBLIC_DESTRUCTION_MEMBER_DTO_MISSING",
    file: "src/app/api/destruction-tournaments/[tournamentId]/route.ts",
    pattern: /player:\s*toPublicPlayerSummaryDto\(member\.player\)/,
  },
  {
    policy: "PUBLIC_DESTRUCTION_PARTICIPANT_DTO_MISSING",
    file: "src/app/api/destruction-tournaments/[tournamentId]/route.ts",
    pattern: /player:\s*toPublicPlayerSummaryDto\(participant\.player\)/,
  },
  {
    policy: "PUBLIC_MATCH_PARTICIPANT_DTO_MISSING",
    file: "src/app/api/matches/[matchId]/route.impl.ts",
    pattern: /player:\s*toPublicPlayerSummaryDto\(participant\.player\)/,
  },
];

const publicSelectFiles = [
  "src/app/api/event-matches/[eventId]/route.ts",
  "src/app/api/destruction-tournaments/[tournamentId]/route.ts",
  "src/app/api/matches/[matchId]/route.impl.ts",
];
const allowedPublicPlayerFields = new Set([
  "id",
  "nickname",
  "tag",
  "currentTier",
  "peakTier",
]);

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

for (const check of requiredChecks) {
  const source = fs.readFileSync(path.join(root, check.file), "utf8");
  if (!check.pattern.test(source)) {
    violations.push({
      policy: check.policy,
      file: check.file,
      line: 1,
    });
  }
}

for (const file of publicSelectFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const selectBlock = source.match(
    /const publicPlayerSelect\s*=\s*\{([\s\S]*?)\}\s*as const;/,
  );

  if (!selectBlock) {
    violations.push({
      policy: "PUBLIC_PLAYER_SELECT_MISSING",
      file,
      line: 1,
    });
    continue;
  }

  const fields = [...selectBlock[1].matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*:\s*true\b/g)]
    .map((match) => match[1]);
  const unexpectedFields = fields.filter(
    (field) => !allowedPublicPlayerFields.has(field),
  );
  const missingFields = [...allowedPublicPlayerFields].filter(
    (field) => !fields.includes(field),
  );

  if (unexpectedFields.length > 0 || missingFields.length > 0) {
    violations.push({
      policy: "PUBLIC_PLAYER_SELECT_CONTRACT",
      file,
      line: source.slice(0, selectBlock.index).split(/\r?\n/).length,
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
