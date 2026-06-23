#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const failOnHigh = args.has("--fail-on-high");
const jsonOnly = args.has("--json-only");

const rel = (...parts) => path.join(root, ...parts);
const posix = (value) => value.split(path.sep).join("/");
const exists = (file) => fs.existsSync(file);

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const name = entry.name;
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git", ".vercel", "coverage", "dist", "build"].includes(name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function routeFromAppFile(file, kind) {
  const relPath = posix(path.relative(rel("src", "app"), file));
  const parts = relPath.split("/");
  const last = parts.pop();
  if (kind === "api") {
    // api/foo/bar/route.ts -> /api/foo/bar
    return "/" + parts.filter((p) => !/^\(.+\)$/.test(p)).join("/");
  }
  // page.tsx -> route path, removing route groups.
  const routeParts = parts.filter((p) => !/^\(.+\)$/.test(p));
  const route = "/" + routeParts.join("/");
  return route === "/" ? "/" : route.replace(/\/page$/, "");
}

function collectPageRoutes() {
  const appDir = rel("src", "app");
  return walk(appDir)
    .filter((file) => /\/page\.(tsx|ts|jsx|js)$/.test(posix(file)))
    .map((file) => {
      const text = readText(file);
      return {
        route: routeFromAppFile(file, "page"),
        file: posix(path.relative(root, file)),
        purpose: inferPurposeFromPath(routeFromAppFile(file, "page"), "page"),
        signals: {
          client: text.includes('"use client"') || text.includes("'use client'"),
          fetch: /\bfetch\s*\(/.test(text),
          prisma: /\bprisma\./.test(text),
          adminCopy: /admin|관리자|운영/i.test(text),
        },
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

function collectApiRoutes() {
  const appDir = rel("src", "app");
  return walk(appDir)
    .filter((file) => /\/route\.(ts|js)$/.test(posix(file)))
    .map((file) => {
      const text = readText(file);
      const route = routeFromAppFile(file, "api");
      const methods = collectMethods(text);
      const auth = detectAuth(text);
      const riskFlags = detectApiRisks(route, text, methods, auth);
      return {
        route,
        file: posix(path.relative(root, file)),
        methods,
        purpose: inferPurposeFromPath(route, "api"),
        expected: inferExpectedValue(route),
        auth,
        usesPrisma: /\bprisma\./.test(text),
        usesEnv: /process\.env\./.test(text),
        usesSecret: /secret|authorization|bearer|token|x-kakao|x-discord|api-secret/i.test(text),
        riskFlags,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

function collectMethods(text) {
  const set = new Set();
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  let match;
  while ((match = re.exec(text))) set.add(match[1]);
  const constRe = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  while ((match = constRe.exec(text))) set.add(match[1]);
  return [...set].sort();
}

function detectAuth(text) {
  const checks = [
    ["requireAdmin", /requireAdmin|assertAdmin|ensureAdmin|adminGuard|verifyAdmin/i],
    ["session/user", /getCurrentUser|getSession|currentUser|verifyAuth|requireUser|me\b/i],
    ["cookie/jwt", /cookies\s*\(|jwt|JWT_SECRET|jsonwebtoken|verifyToken/i],
    ["bearer/secret", /authorization|bearer|secret|api-secret|x-kakao|x-discord/i],
  ];
  return checks.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function detectApiRisks(route, text, methods, auth) {
  const flags = [];
  const hasAuth = auth.length > 0;
  if (methods.length === 0) flags.push("NO_EXPORTED_HTTP_METHOD");
  if (/^\/api\/admin(\/|$)/.test(route) && !hasAuth) flags.push("ADMIN_API_AUTH_REVIEW");
  if (/^\/api\/discord(\/|$)/.test(route) && !hasAuth) flags.push("DISCORD_API_AUTH_REVIEW");
  if (/^\/api\/kakao(\/|$)/.test(route) && !/secret|x-kakao|authorization|bearer/i.test(text)) flags.push("KAKAO_SECRET_REVIEW");
  if (methods.some((m) => ["POST", "PUT", "PATCH", "DELETE"].includes(m)) && !hasAuth && !/^\/api\/(auth|kakao|riot)/.test(route)) flags.push("MUTATION_AUTH_REVIEW");
  if (/findMany\s*\(/.test(text) && !/\btake\s*:|limit|pagination|pageSize/i.test(text)) flags.push("PAGINATION_REVIEW");
  if (/console\.(log|error|warn)\s*\(/.test(text) && /^\/api/.test(route)) flags.push("SERVER_LOG_REVIEW");
  return flags;
}

function inferPurposeFromPath(route, kind) {
  const p = route.toLowerCase();
  if (p.includes("kakao")) return "카카오톡 봇 명령/양식/구인구직 연동 처리";
  if (p.includes("discord")) return "디스코드 봇/음성방/출석/운영 상태 연동 처리";
  if (p.includes("admin")) return kind === "api" ? "관리자 전용 데이터 조회/수정" : "관리자 운영 화면";
  if (p.includes("recruit")) return "구인구직 생성, 현황, 참가자 관리";
  if (p.includes("match")) return "내전 경기 목록, 상세, 등록, 통계 연결";
  if (p.includes("player")) return "플레이어 검색, 상세, 계정/전적 관리";
  if (p.includes("ranking") || p.includes("stats")) return "랭킹/통계 계산 및 표시";
  if (p.includes("season")) return "시즌 생성, 활성화, 시즌 기준 데이터 관리";
  if (p.includes("balance")) return "팀 밸런스/밴픽 추천/랜덤팀 편성";
  if (p.includes("community") || p.includes("notice")) return "공지/커뮤니티/게시글 표시 및 관리";
  if (p.includes("account") || p.includes("auth") || p.includes("login")) return "로그인, 계정, 인증 상태 처리";
  if (p.includes("destruction")) return "멸망전/경매/이벤트 진행 화면 및 관리";
  if (p === "/" || p === "/app") return "서비스 홈/모바일 홈";
  return kind === "api" ? "API 기능 처리" : "화면 표시";
}

function inferExpectedValue(route) {
  const p = route.toLowerCase();
  if (p.includes("kakao")) return "HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message";
  if (p.includes("discord")) return "HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403";
  if (p.includes("admin")) return "관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403";
  if (p.includes("players")) return "플레이어 id/name/nickname/tag/tier/position/stat 등 목적별 필드";
  if (p.includes("matches")) return "내전 series/game/participant/winner/team/KDA 등 경기 구조";
  if (p.includes("recruits")) return "구인 번호, 상태, 인원, 시작시간, 보호시간, 참가자 목록";
  if (p.includes("rankings") || p.includes("stats")) return "시즌 기준 승률/참여수/KDA/MVP 등 계산값";
  return "요청 성공 여부와 화면/호출부가 기대하는 JSON 구조";
}

function collectPrismaModels() {
  const schema = readText(rel("prisma", "schema.prisma"));
  const models = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = re.exec(schema))) {
    const body = match[2];
    const fields = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"));
    models.push({
      name: match[1],
      fieldCount: fields.length,
      hasCreatedAt: /createdAt\s+DateTime/.test(body),
      hasUpdatedAt: /updatedAt\s+DateTime/.test(body),
      relationCount: (body.match(/@relation/g) || []).length,
      purpose: inferModelPurpose(match[1]),
    });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

function inferModelPurpose(name) {
  const n = name.toLowerCase();
  if (n.includes("discord")) return "디스코드 계정/음성/운영 연동 데이터";
  if (n.includes("kakao") || n.includes("recruit")) return "카카오톡/구인구직/참가 신청 데이터";
  if (n.includes("player") || n.includes("user")) return "유저/플레이어/계정 데이터";
  if (n.includes("match") || n.includes("game") || n.includes("participant")) return "내전 경기/세트/참가 기록";
  if (n.includes("season")) return "시즌 기준 데이터";
  if (n.includes("stat") || n.includes("ranking")) return "통계/랭킹 계산 데이터";
  if (n.includes("post") || n.includes("notice") || n.includes("community")) return "공지/커뮤니티 데이터";
  if (n.includes("auction") || n.includes("tournament") || n.includes("destruction")) return "멸망전/경매/토너먼트 데이터";
  return "기타 도메인 데이터";
}

const kakaoBotExpected = [
  ["OPENCHAT_API_URL", "/api/kakao/openchat", ["최근 닉네임#태그", "랭킹"]],
  ["SEARCH_PLAYER_API_URL", "/api/kakao/search-player", ["전적 닉네임#태그"]],
  ["RECRUIT_API_URL", "/api/kakao/recruit/season-apply", ["내전 양식 자동등록", "오늘내전초기화"]],
  ["SEASON_RECRUIT_STATUS_API_URL", "/api/kakao/recruit/season-apply/status", ["내전현황", "AI공지"]],
  ["PARTY_RECRUIT_CREATE_API_URL", "/api/kakao/party-recruits/create", ["/2인파티", "/5인파티", "칼바람구인"]],
  ["PARTY_RECRUIT_SYNC_API_URL", "/api/kakao/party-recruits/sync", ["구인 양식 복사/수정 반영"]],
  ["PARTY_RECRUIT_FINISH_API_URL", "/api/kakao/party-recruits/finish", ["13ㅉ", "구인마감 13"]],
  ["PARTY_RECRUIT_STATUS_API_URL", "/api/kakao/party-recruits/status", ["구인현황", "구인상세 13"]],
  ["OPERATION_FORM_API_URL", "/api/kakao/operation-forms", ["지인/건의/모임/외출 양식 접수"]],
];

function collectKakaoMapping(apiRoutes) {
  const routeSet = new Set(apiRoutes.map((r) => r.route));
  return kakaoBotExpected.map(([key, route, commands]) => ({
    key,
    route,
    commands,
    exists: routeSet.has(route),
    matchedFile: apiRoutes.find((r) => r.route === route)?.file || "",
  }));
}

function collectCleanupCandidates() {
  const files = walk(root);
  const candidates = [];
  const patterns = [
    [/\.bak($|[._-])|backup|_backup|\.old$|\.orig$|\.tmp$/i, "BACKUP_OR_TEMP_NAME"],
    [/\.(zip|tar|tar\.gz|tgz|7z|rar)$/i, "ARCHIVE_IN_REPO"],
    [/tsconfig\.tsbuildinfo$/i, "BUILD_CACHE"],
    [/\.env_backup/i, "ENV_BACKUP_RISK"],
    [/\.(log)$/i, "LOG_FILE"],
  ];
  for (const file of files) {
    const r = posix(path.relative(root, file));
    for (const [re, reason] of patterns) {
      if (re.test(r)) {
        candidates.push({ file: r, reason });
        break;
      }
    }
  }
  return candidates.sort((a, b) => a.file.localeCompare(b.file));
}

function collectFeatureGroups(apiRoutes, pageRoutes, models) {
  const groups = [
    ["인증/계정", ["auth", "account", "login", "signup", "me", "forgot-password"]],
    ["플레이어", ["player", "players", "my-player"]],
    ["내전/경기", ["match", "matches", "participation"]],
    ["시즌/통계/랭킹", ["season", "stats", "rankings", "ranking"]],
    ["팀 밸런스/밴픽", ["balance", "team-balance", "random-team"]],
    ["구인구직/카카오톡", ["recruit", "kakao", "party-recruits", "operation-forms"]],
    ["디스코드 운영", ["discord"]],
    ["관리자", ["admin"]],
    ["공지/커뮤니티/하이라이트", ["community", "notice", "notices", "highlight", "gallery", "images"]],
    ["멸망전/경매", ["destruction", "auction", "tournament"]],
    ["모바일 APP", ["/app", "app/"]],
  ];

  return groups.map(([name, keywords]) => {
    if (name === "모바일 APP") {
      return {
        name,
        apiCount: 0,
        pageCount: pageRoutes.filter((r) => r.route === "/app" || r.route.startsWith("/app/")).length,
        modelCount: 0,
        purpose: inferGroupPurpose(name),
        normalCriteria: inferGroupCriteria(name),
      };
    }

    const hit = (value) => keywords.some((k) => value.toLowerCase().includes(k.toLowerCase()));
    return {
      name,
      apiCount: apiRoutes.filter((r) => hit(r.route) || hit(r.file)).length,
      pageCount: pageRoutes.filter((r) => hit(r.route) || hit(r.file)).length,
      modelCount: models.filter((m) => hit(m.name) || hit(m.purpose)).length,
      purpose: inferGroupPurpose(name),
      normalCriteria: inferGroupCriteria(name),
    };
  });
}

function inferGroupPurpose(name) {
  const map = {
    "인증/계정": "승인된 유저만 민감 기능을 사용하도록 로그인·권한·계정 연결을 관리",
    "플레이어": "내전 참가자의 기본 정보, 티어, 라인, 상세 전적을 관리",
    "내전/경기": "내전 등록, 참가자, 세트, 승패, KDA 기록을 저장하고 조회",
    "시즌/통계/랭킹": "시즌별 승률, 참여 수, KDA, Top3 등 운영 지표 산출",
    "팀 밸런스/밴픽": "참가자 티어/포지션/기록을 기준으로 팀 구성 및 밴픽 추천",
    "구인구직/카카오톡": "카카오톡 명령어와 양식을 사이트 DB에 반영하고 현황을 반환",
    "디스코드 운영": "음성방 접속, 출석, 지각, 자동마감, 운영 로그를 사이트와 연동",
    "관리자": "운영자가 유저, 시즌, 내전, 구인, 디스코드 상태를 관리",
    "공지/커뮤니티/하이라이트": "유저 공지, 게시글, 이미지/영상 콘텐츠 표시 및 관리",
    "멸망전/경매": "이벤트성 경매/토너먼트 진행 및 공개 화면 제공",
    "모바일 APP": "모바일 전용 화면에서 핵심 기능을 빠르게 제공",
  };
  return map[name] || "기능 그룹";
}

function inferGroupCriteria(name) {
  const map = {
    "인증/계정": "미로그인 401/리다이렉트, 승인 유저 정상 접근, 관리자 권한 분리",
    "플레이어": "검색 결과/상세/티어/라인/계정 연결값이 DB와 일치",
    "내전/경기": "등록 후 목록·상세·플레이어 최근 경기·통계에 일관 반영",
    "시즌/통계/랭킹": "시즌 필터 기준으로 승/패/참여/KDA 산식이 일치",
    "팀 밸런스/밴픽": "참가자 수, 라인, 티어 가중치, 저장/불러오기 결과가 일치",
    "구인구직/카카오톡": "봇 명령어가 2xx JSON reply를 받고 DB 상태가 중복 없이 반영",
    "디스코드 운영": "VOICE JOIN/LEAVE, 출석/지각/마감 후보가 실제 음성방 상태와 일치",
    "관리자": "관리자 외 접근 차단, 등록/수정/삭제 후 화면과 DB 상태 일치",
    "공지/커뮤니티/하이라이트": "승인/비공개/조회/좋아요/첨부 표시 기준 일치",
    "멸망전/경매": "참가자/티어/추첨/경매 단계가 중복 없이 자연스럽게 진행",
    "모바일 APP": "PC 화면으로 이탈하지 않고 app 전용 라우트에서 기능 완료",
  };
  return map[name] || "기능 목적에 맞는 입력/출력/DB 값 확인";
}

function markdownTable(headers, rows) {
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const head = `| ${headers.map(esc).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(esc).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function makeReport(data) {
  const now = new Date().toISOString();
  const highRisks = data.apiRoutes.flatMap((r) => r.riskFlags.map((flag) => ({ route: r.route, flag })));
  const missingKakao = data.kakaoMapping.filter((m) => !m.exists);

  const summaryRows = [
    ["생성 시각", now],
    ["페이지 route", data.pageRoutes.length],
    ["API route", data.apiRoutes.length],
    ["Prisma model", data.prismaModels.length],
    ["카카오톡 봇 기대 endpoint", data.kakaoMapping.length],
    ["카카오톡 endpoint 누락", missingKakao.length],
    ["API 검토 플래그", highRisks.length],
    ["삭제/정리 후보", data.cleanupCandidates.length],
  ];

  const featureRows = data.featureGroups.map((g) => [g.name, g.purpose, g.apiCount, g.pageCount, g.modelCount, g.normalCriteria]);
  const kakaoRows = data.kakaoMapping.map((m) => [m.exists ? "OK" : "누락", m.key, m.route, m.commands.join(", "), m.matchedFile || "-"]);
  const apiRiskRows = data.apiRoutes
    .filter((r) => r.riskFlags.length > 0)
    .map((r) => [r.route, r.methods.join(", ") || "-", r.file, r.riskFlags.join(", "), r.purpose]);
  const cleanupRows = data.cleanupCandidates.slice(0, 200).map((c) => [c.reason, c.file]);
  const pageRows = data.pageRoutes.map((r) => [r.route, r.file, r.purpose, r.signals.client ? "client" : "server"]);
  const apiRows = data.apiRoutes.map((r) => [r.route, r.methods.join(", ") || "-", r.file, r.purpose, r.expected, r.auth.join(", ") || "검토 필요"]);
  const modelRows = data.prismaModels.map((m) => [m.name, m.purpose, m.fieldCount, m.relationCount, m.hasCreatedAt ? "Y" : "N", m.hasUpdatedAt ? "Y" : "N"]);

  return `# K-LOL.GG 프로젝트 기능 검수 리포트

> 이 문서는 \`npm run audit:project\` 실행 결과입니다. 기능의 목적, 예상값, 연결 경로, 검토 플래그를 빠르게 확인하기 위한 1차 감사 자료입니다.

## 1. 요약

${markdownTable(["항목", "값"], summaryRows)}

## 2. 기능 그룹별 목적 / 정상 기준

${markdownTable(["기능 그룹", "목적", "API", "Page", "Model", "정상 기준"], featureRows)}

## 3. 카카오톡 봇 코드 ↔ 웹 API 매핑

${markdownTable(["상태", "봇 상수", "웹 API", "대표 명령/양식", "파일"], kakaoRows)}

## 4. API 검토 플래그

${apiRiskRows.length ? markdownTable(["API", "Method", "파일", "검토 플래그", "목적"], apiRiskRows) : "검토 플래그가 없습니다."}

### 플래그 의미

${markdownTable(["플래그", "의미"], [
    ["ADMIN_API_AUTH_REVIEW", "관리자 API로 보이나 권한 확인 코드가 명확하지 않음"],
    ["DISCORD_API_AUTH_REVIEW", "디스코드 API로 보이나 봇 secret/관리자 권한 확인이 명확하지 않음"],
    ["KAKAO_SECRET_REVIEW", "카카오 API로 보이나 secret/header 확인이 명확하지 않음"],
    ["MUTATION_AUTH_REVIEW", "데이터 변경 API인데 인증 신호가 명확하지 않음"],
    ["PAGINATION_REVIEW", "findMany 사용 시 take/pageSize 등 제한 확인 필요"],
    ["SERVER_LOG_REVIEW", "API 내부 console 로그 사용 여부 검토"],
    ["NO_EXPORTED_HTTP_METHOD", "route 파일에 GET/POST 등 HTTP export가 탐지되지 않음"],
  ])}

## 5. 삭제/정리 후보

${cleanupRows.length ? markdownTable(["분류", "파일"], cleanupRows) : "정리 후보가 없습니다."}

## 6. 전체 API 목록

${markdownTable(["API", "Method", "파일", "목적", "예상값", "인증 신호"], apiRows)}

## 7. 전체 Page 목록

${markdownTable(["Route", "파일", "목적", "렌더 유형"], pageRows)}

## 8. Prisma 모델 목록

${markdownTable(["Model", "목적", "필드 수", "관계 수", "createdAt", "updatedAt"], modelRows)}

## 9. 다음 수동 검수 순서

1. 카카오톡: \`봇버전\`, \`내전구인\`, \`내전현황\`, \`/2인파티\`, \`구인현황\`, \`13ㅉ\`, 운영 양식 4종을 순서대로 테스트합니다.
2. 디스코드: 음성방 입장/퇴장 → \`/admin/discord\` 반영 → 구인 검증 → 자동마감 후보/완료 로그를 확인합니다.
3. 관리자: 내전 등록 → 내전 목록 → 플레이어 상세 최근 경기 → 랭킹 반영까지 한 흐름으로 확인합니다.
4. 모바일: \`/app\` 내부에서 PC 화면으로 이탈하지 않는지 확인합니다.
5. API 검토 플래그는 실제 코드 의도와 비교해 오탐 여부를 분류한 뒤 수정/무시를 결정합니다.
`;
}

function main() {
  if (!exists(rel("package.json"))) {
    console.error("[audit] package.json이 있는 프로젝트 루트에서 실행하세요.");
    process.exit(1);
  }

  const pageRoutes = collectPageRoutes();
  const apiRoutes = collectApiRoutes();
  const prismaModels = collectPrismaModels();
  const kakaoMapping = collectKakaoMapping(apiRoutes);
  const cleanupCandidates = collectCleanupCandidates();
  const featureGroups = collectFeatureGroups(apiRoutes, pageRoutes, prismaModels);
  const data = {
    generatedAt: new Date().toISOString(),
    root: posix(root),
    counts: {
      pages: pageRoutes.length,
      apiRoutes: apiRoutes.length,
      prismaModels: prismaModels.length,
      cleanupCandidates: cleanupCandidates.length,
    },
    featureGroups,
    kakaoMapping,
    apiRoutes,
    pageRoutes,
    prismaModels,
    cleanupCandidates,
  };

  const outDir = rel("docs", "audit", "generated");
  writeText(path.join(outDir, "KLOL_PROJECT_AUDIT.json"), JSON.stringify(data, null, 2));
  if (!jsonOnly) {
    writeText(path.join(outDir, "KLOL_PROJECT_AUDIT.md"), makeReport(data));
  }

  const riskCount = apiRoutes.reduce((sum, r) => sum + r.riskFlags.length, 0);
  const missingKakao = kakaoMapping.filter((m) => !m.exists).length;
  console.log(`[audit] pages=${pageRoutes.length} api=${apiRoutes.length} models=${prismaModels.length} risks=${riskCount} cleanupCandidates=${cleanupCandidates.length} missingKakao=${missingKakao}`);
  console.log(`[audit] wrote ${posix(path.relative(root, path.join(outDir, "KLOL_PROJECT_AUDIT.md")))}`);

  if (failOnHigh && (missingKakao > 0 || riskCount > 0)) {
    console.error(`[audit] fail-on-high: risks=${riskCount}, missingKakao=${missingKakao}`);
    process.exit(2);
  }
}

main();
