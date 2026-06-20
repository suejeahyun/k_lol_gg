import dotenv from "dotenv";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local", override: false, quiet: true });
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
  "OPENAI_VISION_MODEL",
];

const missing = requiredEnv.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error("배포 필수 환경변수 누락:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

const weakValues = [];
for (const key of requiredEnv) {
  const value = process.env[key] || "";
  if (value.length < 12) weakValues.push(`${key}: 12자 미만`);
  if (/^(admin|password|1234|7942|klol|test)$/i.test(value)) weakValues.push(`${key}: 취약한 값`);
}

if (weakValues.length > 0) {
  console.error("배포 환경변수 강도 점검 실패:");
  for (const item of weakValues) console.error(`- ${item}`);
  process.exit(1);
}

console.log("배포 필수 환경변수 점검 완료");
console.log(`선택 환경변수: ${optionalEnv.map((key) => `${key}=${process.env[key] ? "설정됨" : "미설정"}`).join(", ")}`);

