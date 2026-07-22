import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) {
    failures.push(`필수 파일 없음: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
}

const noindexLayouts = [
  "src/app/(admin)/admin/layout.tsx",
  "src/app/app/layout.tsx",
  "src/app/(user)/account/layout.tsx",
  "src/app/(user)/me/layout.tsx",
  "src/app/(user)/participation/layout.tsx",
  "src/app/(user)/players/balance/layout.tsx",
];

for (const file of noindexLayouts) {
  const source = read(file);
  if (!/robots\s*:\s*\{[\s\S]*?index\s*:\s*false/.test(source)) {
    failures.push(`noindex 메타데이터 누락: ${file}`);
  }
}

const publicPages = [
  "src/app/(user)/page.tsx",
  "src/app/(user)/players/page.tsx",
  "src/app/(user)/rankings/page.tsx",
  "src/app/(user)/matches/page.tsx",
  "src/app/(user)/recruit/page.tsx",
  "src/app/(user)/progress/page.tsx",
  "src/app/(user)/progress/destruction/page.tsx",
  "src/app/(user)/progress/event/page.tsx",
  "src/app/(user)/highlights/page.tsx",
  "src/app/(user)/images/page.tsx",
  "src/app/(user)/kakao/page.tsx",
  "src/app/(user)/recruit-helper/page.tsx",
  "src/app/(user)/riot-api/page.tsx",
  "src/app/(user)/coin-toss/page.tsx",
  "src/app/(user)/random-team/page.tsx",
  "src/app/(user)/privacy/page.tsx",
  "src/app/(user)/terms/page.tsx",
];

for (const file of publicPages) {
  const source = read(file);
  if (!/export const metadata\s*:\s*Metadata/.test(source)) {
    failures.push(`공개 페이지 metadata 누락: ${file}`);
    continue;
  }
  if (!/title\s*:/.test(source) || !/description\s*:/.test(source)) {
    failures.push(`공개 페이지 제목 또는 설명 누락: ${file}`);
  }
  if (!/alternates\s*:\s*\{[\s\S]*?canonical\s*:/.test(source)) {
    failures.push(`공개 페이지 canonical 누락: ${file}`);
  }
}

const publicDetailPages = [
  "src/app/(user)/players/[playerId]/page.tsx",
  "src/app/(user)/matches/[matchId]/page.tsx",
  "src/app/(user)/highlights/[highlightId]/page.tsx",
  "src/app/(user)/images/[imageId]/page.tsx",
  "src/app/(user)/progress/event/[eventId]/page.tsx",
  "src/app/(user)/progress/destruction/[tournamentId]/page.tsx",
];

for (const file of publicDetailPages) {
  const source = read(file);
  if (!/export async function generateMetadata/.test(source)) {
    failures.push(`공개 상세 페이지 generateMetadata 누락: ${file}`);
  }
  if (!/title\s*:/.test(source) || !/description\s*:/.test(source)) {
    failures.push(`공개 상세 페이지 제목 또는 설명 누락: ${file}`);
  }
  if (!/alternates\s*:\s*\{[\s\S]*?canonical\s*:/.test(source)) {
    failures.push(`공개 상세 페이지 canonical 누락: ${file}`);
  }
}

const robots = read("src/app/robots.ts");
for (const route of [
  "/admin",
  "/api/",
  "/app",
  "/account",
  "/me/",
  "/participation",
  "/players/balance",
  "/destruction-auction-live",
]) {
  if (!robots.includes(`"${route}"`)) failures.push(`robots 차단 누락: ${route}`);
}

const sitemap = read("src/app/sitemap.ts");
for (const route of [
  "/",
  "/players",
  "/rankings",
  "/matches",
  "/recruit",
  "/progress",
  "/progress/destruction",
  "/progress/event",
  "/recruit-helper",
] ) {
  if (!sitemap.includes(`path: "${route}"`)) failures.push(`sitemap 공개 경로 누락: ${route}`);
}

if (failures.length > 0) {
  console.error("SEO 준비 상태 점검 실패:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SEO 준비 상태 점검 완료");
