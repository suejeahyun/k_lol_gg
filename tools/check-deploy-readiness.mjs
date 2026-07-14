import fs from "node:fs";
import dotenv from "dotenv";

const primaryEnvPath = process.env.DOTENV_CONFIG_PATH || ".env.local";
dotenv.config({ path: primaryEnvPath, override: false, quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const requiredEnv = [
  "DATABASE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "JWT_SECRET",
  "ADMIN_TOKEN_VALUE",
  "SUPER_ADMIN_ID",
  "SUPER_ADMIN_PASSWORD",
  "KAKAO_OPENCHAT_SECRET",
  "KAKAO_SEARCH_PLAYER_SECRET",
  "KAKAO_RECRUIT_SECRET",
];

const optionalEnv = [
  "DIRECT_URL",
  "RIOT_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_VISION_MODEL",
  "SITE_FEATURE_AI_ASSISTANT_DEFAULT",
  "SITE_FEATURE_KAKAO_DEFAULT",
  "SITE_FEATURE_RECRUIT_DEFAULT",
  "SITE_FEATURE_BALANCE_AI_DEFAULT",
  "SITE_FEATURE_RANDOM_TEAM_DEFAULT",
  "SITE_FEATURE_RIOT_DEFAULT",
];

const envFiles = [primaryEnvPath, ".env", ".env.example"];
const problems = [];
const warnings = [];

function addProblem(message) {
  problems.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return { entries: [], duplicates: [] };

  const seen = new Map();
  const entries = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, line: index + 1 }))
    .filter(({ raw }) => raw.trim() && !raw.trim().startsWith("#"))
    .map(({ raw, line }) => {
      const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return null;
      const key = match[1];
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      seen.set(key, (seen.get(key) || 0) + 1);
      return { filePath, line, key, value };
    })
    .filter(Boolean);

  return {
    entries,
    duplicates: [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  };
}

const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
for (const key of missing) addProblem(`배포 필수 환경변수 누락: ${key}`);

for (const key of requiredEnv) {
  const value = process.env[key]?.trim() || "";
  if (!value) continue;

  if (["JWT_SECRET", "ADMIN_TOKEN_VALUE"].includes(key) && value.length < 32) {
    addProblem(`${key}: 최소 32자 이상의 랜덤 값이 필요합니다.`);
    continue;
  }

  if (!["SUPER_ADMIN_ID"].includes(key) && value.length < 12) {
    addWarning(`${key}: 12자 미만입니다. 운영 배포에서는 더 긴 값이 안전합니다.`);
  }

  if (/^(admin|password|1234|7942|klol|test)$/i.test(value)) {
    addWarning(`${key}: 추측하기 쉬운 값입니다. 운영 배포에서는 교체를 권장합니다.`);
  }
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
if (baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      addProblem("NEXT_PUBLIC_BASE_URL은 운영 배포에서 https 주소를 사용해야 합니다.");
    }
    if (["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      addWarning("NEXT_PUBLIC_BASE_URL이 로컬 주소입니다. Vercel Production에는 운영 URL을 설정하세요.");
    }
  } catch {
    addProblem("NEXT_PUBLIC_BASE_URL 형식이 올바르지 않습니다.");
  }
}

const openAiKey = process.env.OPENAI_API_KEY?.trim();
if (openAiKey && !/^sk-[A-Za-z0-9_-]+$/.test(openAiKey)) {
  addProblem("OPENAI_API_KEY 형식이 올바르지 않습니다. OpenAI 키는 sk- 로 시작해야 합니다.");
}

if (truthy(process.env.SITE_FEATURE_AI_ASSISTANT_DEFAULT) && !openAiKey) {
  addWarning("AI 운영 비서가 기본 활성화 상태지만 OPENAI_API_KEY가 없습니다. 기본 응답 모드로 동작합니다.");
}

for (const filePath of envFiles) {
  const { entries, duplicates } = parseEnvFile(filePath);
  for (const key of duplicates) addWarning(`${filePath}에 ${key}가 중복 정의되어 있습니다.`);

  for (const entry of entries) {
    if (/[A-Z][A-Z0-9_]+\s*=/.test(entry.value)) {
      addProblem(`${entry.filePath}:${entry.line} ${entry.key} 값에 다른 환경변수 선언이 붙어 있습니다.`);
    }
    if (entry.key === "OPENAI_API_KEY" && entry.value && !/^sk-[A-Za-z0-9_-]+$/.test(entry.value)) {
      addProblem(`${entry.filePath}:${entry.line} OPENAI_API_KEY 형식이 올바르지 않습니다.`);
    }
    if (entry.key === "DATABASE_URL" && /""$/.test(entry.value)) {
      addProblem(`${entry.filePath}:${entry.line} DATABASE_URL 끝에 따옴표가 중복되어 있습니다.`);
    }
  }
}

if (warnings.length > 0) {
  console.warn("배포 환경변수 점검 경고:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (problems.length > 0) {
  console.error("배포 환경변수 점검 실패:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("배포 필수 환경변수 점검 완료");
console.log(`선택 환경변수: ${optionalEnv.map((key) => `${key}=${process.env[key] ? "설정됨" : "미설정"}`).join(", ")}`);
