import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAXIMUM_TEXT_BYTES = 2 * 1024 * 1024;
const SKIPPED_PATHS = new Set(["package-lock.json"]);
const PLACEHOLDER_WORDS =
  /(?:example|placeholder|synthetic|dummy|sample|unit[-_]?test|not[-_]?the|change[-_]?me|not[-_]?a[-_]?secret)/i;

const RULES = [
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
  { id: "stripe-secret", pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  {
    id: "discord-webhook",
    pattern: /https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[0-9A-Za-z_-]{20,}/g,
  },
  {
    id: "literal-secret-assignment",
    pattern:
      /\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*["']([^"'\r\n]{16,})["']/gi,
    capture: 1,
  },
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function isText(buffer) {
  return !buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0);
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function scanText(text, source, findings) {
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const candidate = String(match[rule.capture ?? 0] ?? "");
      if (PLACEHOLDER_WORDS.test(candidate)) continue;
      findings.push({
        rule: rule.id,
        source,
        line: lineNumberAt(text, match.index ?? 0),
      });
    }
  }
}

function currentTreeSources() {
  const output = git(["ls-files", "-co", "--exclude-standard", "-z"]);
  return [...new Set(output.split("\0").filter(Boolean))].filter(
    (file) => !SKIPPED_PATHS.has(file),
  );
}

function scanCurrentTree(findings) {
  for (const file of currentTreeSources()) {
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch {
      continue;
    }
    if (buffer.length > MAXIMUM_TEXT_BYTES || !isText(buffer)) continue;
    scanText(buffer.toString("utf8"), `tree:${file}`, findings);
  }
}

function historyBlobSources() {
  const objects = git(["rev-list", "--objects", "--all"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      return {
        oid: separator === -1 ? line : line.slice(0, separator),
        path: separator === -1 ? "" : line.slice(separator + 1),
      };
    });

  if (objects.length === 0) return [];
  const input = `${objects.map(({ oid }) => oid).join("\n")}\n`;
  const metadata = git(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { input },
  )
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [oid, type, size] = line.split(" ");
      return { oid, type, size: Number(size) };
    });
  const byOid = new Map(objects.map((source) => [source.oid, source]));

  return metadata
    .filter(({ type, size }) => type === "blob" && size <= MAXIMUM_TEXT_BYTES)
    .map(({ oid, size }) => ({ ...byOid.get(oid), oid, size }))
    .filter(({ path }) => path && !SKIPPED_PATHS.has(path));
}

function scanHistory(findings) {
  for (const { oid, path } of historyBlobSources()) {
    const result = spawnSync("git", ["cat-file", "blob", oid], {
      cwd: process.cwd(),
      encoding: null,
      maxBuffer: MAXIMUM_TEXT_BYTES + 1,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || !isText(result.stdout)) continue;
    scanText(result.stdout.toString("utf8"), `history:${oid.slice(0, 12)}:${path}`, findings);
  }
}

const findings = [];
scanCurrentTree(findings);
scanHistory(findings);

const unique = [...new Map(findings.map((finding) => [
  `${finding.rule}:${finding.source}:${finding.line}`,
  finding,
])).values()];

if (unique.length > 0) {
  console.error(`[secret-scan] blocked: ${unique.length} high-confidence finding(s)`);
  for (const finding of unique) {
    console.error(`[secret-scan] rule=${finding.rule} source=${finding.source} line=${finding.line}`);
  }
  process.exitCode = 1;
} else {
  console.log("[secret-scan] passed: tracked tree and complete Git history contain no high-confidence secret patterns.");
}
