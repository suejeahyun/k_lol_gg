import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  rejectIfBodyTooLarge,
  rejectIfInvalidOrigin,
} from "../src/lib/security/request-guard";
import {
  isCronConfigured,
  isCronRequestAuthorized,
} from "../src/lib/security/cron-auth";
import { rejectIfRateLimited } from "../src/lib/security/rate-limit";
import {
  buildContentSecurityPolicy,
  getSecurityHeaderEntries,
} from "../src/lib/security-policy";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
} from "../src/lib/security/totp-secret-storage";
import { readJsonObject } from "../src/lib/http/json-body";
import { createCsvStreamResponse, toCsvWithHeaders } from "../src/lib/csv";

function request(
  pathname: string,
  options: { method?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest(`https://k-lol-gg.example${pathname}`, {
    method: options.method ?? "POST",
    headers: options.headers,
  });
}

function contentLengthRequest(pathname: string, bytes: number) {
  return request(pathname, {
    headers: { "content-length": String(bytes) },
  });
}

const formulaSafeCsv = toCsvWithHeaders(
  ["value"],
  [["=1+1"], ["+SUM(A1:A2)"], ["-2+3"], ["@cmd"], ["\t=1+1"]],
);
for (const dangerousValue of ["'=1+1", "'+SUM(A1:A2)", "'-2+3", "'@cmd", "'\t=1+1"]) {
  assert.match(
    formulaSafeCsv,
    new RegExp(dangerousValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "CSV로 내보낸 사용자 값은 스프레드시트 수식으로 실행되면 안 됩니다.",
  );
}

function collectRouteFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(entryPath);
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

for (const routePath of collectRouteFiles(path.join(process.cwd(), "src/app/api"))) {
  const source = fs.readFileSync(routePath, "utf8");
  assert.doesNotMatch(
    source,
    /(?:req|request)\.json\(\)(?!\.catch)/,
    `${path.relative(process.cwd(), routePath)}: 요청 JSON은 readJsonObject 또는 명시적 파싱 오류 처리를 사용해야 합니다.`,
  );
}

async function checkJsonBodyParser() {
  assert.deepEqual(
    await readJsonObject<{ value: number }>(
      new Request("https://k-lol-gg.example/api/test", {
        method: "POST",
        body: JSON.stringify({ value: 1 }),
      }),
    ),
    { value: 1 },
  );
  assert.equal(
    await readJsonObject(
      new Request("https://k-lol-gg.example/api/test", {
        method: "POST",
        body: "{broken",
      }),
    ),
    null,
    "깨진 JSON은 서버 오류가 아니라 입력 오류로 처리할 수 있어야 합니다.",
  );
  assert.equal(
    await readJsonObject(
      new Request("https://k-lol-gg.example/api/test", {
        method: "POST",
        body: "[]",
      }),
    ),
    null,
    "객체 API는 배열 JSON을 거부해야 합니다.",
  );
}

async function checkCsvStream() {
  async function* rows() {
    yield [1, "normal"];
    yield [2, "=1+1"];
  }

  const response = createCsvStreamResponse(
    "test.csv",
    ["id", "value"],
    rows(),
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(bytes);
  assert.match(csv, /^id,value\n/);
  assert.match(csv, /2,'=1\+1/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
}

assert.equal(
  rejectIfBodyTooLarge(contentLengthRequest("/api/players", 1024 * 1024)),
  null,
  "일반 API는 1MB까지 허용해야 합니다.",
);

const twoFactorClientSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/(admin)/admin/security/_components/AdminSecurityTwoFactorClient.tsx",
  ),
  "utf8",
);
assert.doesNotMatch(
  twoFactorClientSource,
  /api\.qrserver\.com|chart\.googleapis\.com/i,
  "TOTP 비밀키가 외부 QR 생성 서비스로 전송되면 안 됩니다.",
);

for (const routePath of [
  "src/app/api/admin/2fa/enable/route.ts",
  "src/app/api/admin/2fa/disable/route.ts",
  "src/app/api/admin/users/[userAccountId]/2fa-reset/route.ts",
]) {
  const source = fs.readFileSync(path.join(process.cwd(), routePath), "utf8");
  assert.match(
    source,
    /authVersion:\s*\{\s*increment:\s*1\s*\}/,
    `${routePath}: 2FA 상태 변경 시 기존 세션을 무효화해야 합니다.`,
  );
}

const originalTotpEncryptionKey = process.env.TOTP_ENCRYPTION_KEY;
try {
  process.env.TOTP_ENCRYPTION_KEY = "test-only-totp-encryption-key-32-characters";
  const plainSecret = "JBSWY3DPEHPK3PXP";
  const encryptedSecret = encryptTotpSecret(plainSecret);
  assert.equal(isEncryptedTotpSecret(encryptedSecret), true);
  assert.notEqual(encryptedSecret, plainSecret);
  assert.equal(decryptTotpSecret(encryptedSecret), plainSecret);
  assert.equal(
    decryptTotpSecret(plainSecret),
    plainSecret,
    "기존 평문 TOTP 값은 로그인 시 자동 이전할 수 있어야 합니다.",
  );
  const encryptedParts = encryptedSecret.split(":");
  const tamperedTag = Buffer.from(encryptedParts[3], "base64url");
  tamperedTag[0] ^= 0xff;
  encryptedParts[3] = tamperedTag.toString("base64url");
  assert.throws(
    () => decryptTotpSecret(encryptedParts.join(":")),
    "변조된 TOTP 암호문은 인증 태그 검증에 실패해야 합니다.",
  );
} finally {
  if (originalTotpEncryptionKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = originalTotpEncryptionKey;
}
assert.equal(
  rejectIfBodyTooLarge(contentLengthRequest("/api/players", 1024 * 1024 + 1))?.status,
  413,
  "일반 API의 1MB 초과 본문을 거부해야 합니다.",
);
assert.equal(
  rejectIfBodyTooLarge(
    contentLengthRequest("/api/kakao/openchat", 256 * 1024 + 1),
  )?.status,
  413,
  "카카오 API의 256KB 초과 본문을 거부해야 합니다.",
);
assert.equal(
  rejectIfBodyTooLarge(
    contentLengthRequest("/api/matches/import-lol-result", 13 * 1024 * 1024),
  ),
  null,
  "12MB 이미지와 멀티파트 오버헤드를 허용해야 합니다.",
);
assert.equal(
  rejectIfBodyTooLarge(
    contentLengthRequest("/api/matches/import-lol-result", 13 * 1024 * 1024 + 1),
  )?.status,
  413,
  "경기 이미지 요청은 13MB를 넘으면 거부해야 합니다.",
);
assert.equal(
  rejectIfBodyTooLarge(
    request("/api/players", { headers: { "content-length": "invalid" } }),
  )?.status,
  400,
  "잘못된 Content-Length를 거부해야 합니다.",
);
assert.equal(
  rejectIfBodyTooLarge(
    new NextRequest("https://k-lol-gg.example/api/players", {
      method: "GET",
      headers: { "content-length": String(20 * 1024 * 1024) },
    }),
  ),
  null,
  "안전한 메서드는 본문 제한 대상이 아니어야 합니다.",
);

assert.equal(
  rejectIfInvalidOrigin(
    request("/api/players", { headers: { origin: "https://evil.example" } }),
  )?.status,
  403,
  "교차 출처 변경 요청을 거부해야 합니다.",
);
assert.equal(
  rejectIfInvalidOrigin(
    request("/api/players", {
      headers: { origin: "https://k-lol-gg.example" },
    }),
  ),
  null,
  "동일 출처 변경 요청을 허용해야 합니다.",
);

const originalCronSecret = process.env.CRON_SECRET;
try {
  process.env.CRON_SECRET = "daily-maintenance-secret";
  assert.equal(isCronConfigured(), true, "충분히 긴 Cron secret을 인식해야 합니다.");
  assert.equal(
    isCronRequestAuthorized(
      request("/api/cron/maintenance", {
        method: "GET",
        headers: { authorization: "Bearer daily-maintenance-secret" },
      }),
    ),
    true,
    "일치하는 Bearer Cron secret을 허용해야 합니다.",
  );
  assert.equal(
    isCronRequestAuthorized(
      request("/api/cron/maintenance", {
        method: "GET",
        headers: { authorization: "Bearer wrong-secret-value" },
      }),
    ),
    false,
    "일치하지 않는 Cron secret을 거부해야 합니다.",
  );

  process.env.CRON_SECRET = "too-short";
  assert.equal(isCronConfigured(), false, "짧은 Cron secret을 미설정으로 취급해야 합니다.");
} finally {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
}

const originalBotEnv = {
  SECURITY_REQUIRE_KAKAO_SECRET: process.env.SECURITY_REQUIRE_KAKAO_SECRET,
  KAKAO_OPENCHAT_SECRET: process.env.KAKAO_OPENCHAT_SECRET,
};
try {
  process.env.SECURITY_REQUIRE_KAKAO_SECRET = "true";
  process.env.KAKAO_OPENCHAT_SECRET = "verified-openchat-secret";

  let rejectedStatus: number | undefined;
  for (let index = 0; index < 121; index += 1) {
    rejectedStatus = rejectIfRateLimited(
      request("/api/kakao/openchat", {
        headers: {
          authorization: "Bearer forged-secret",
          "x-forwarded-for": "203.0.113.80",
        },
      }),
    )?.status;
  }
  assert.equal(
    rejectedStatus,
    429,
    "위조된 Authorization 헤더는 신뢰된 봇 한도를 받으면 안 됩니다.",
  );

  assert.equal(
    rejectIfRateLimited(
      request("/api/kakao/openchat", {
        headers: {
          authorization: "Bearer verified-openchat-secret",
          "x-forwarded-for": "203.0.113.80",
        },
      }),
    ),
    null,
    "검증된 봇 비밀키만 별도의 신뢰 한도를 받아야 합니다.",
  );
} finally {
  for (const [key, value] of Object.entries(originalBotEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const productionCsp = buildContentSecurityPolicy(true);
assert.match(
  productionCsp,
  /connect-src 'self'(?:;|$)/,
  "프로덕션 CSP 연결 대상은 동일 출처로 제한해야 합니다.",
);
assert.doesNotMatch(
  productionCsp,
  /connect-src[^;]*https:/,
  "프로덕션 CSP에서 모든 HTTPS 연결을 허용하면 안 됩니다.",
);
assert.equal(
  getSecurityHeaderEntries(true).find(
    (header) => header.key === "Content-Security-Policy",
  )?.value,
  productionCsp,
  "공통 보안 헤더와 CSP 생성 결과가 일치해야 합니다.",
);

async function checkProxyCachePolicy() {
  const originalAdminToken = process.env.ADMIN_TOKEN_VALUE;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.ADMIN_TOKEN_VALUE ||= "security-check-admin-token";
    process.env.DATABASE_URL ||= "postgresql://security:check@127.0.0.1:5432/security_check";
    const { proxy } = await import("../src/proxy");

    const adminLoginProxyResponse = await proxy(
      request("/api/admin/login", { method: "GET" }),
    );
    assert.equal(
      adminLoginProxyResponse.headers.get("cache-control"),
      "private, no-store, max-age=0",
      "관리자·인증 응답은 공통 게이트에서 비캐시 처리해야 합니다.",
    );

    const publicApiProxyResponse = await proxy(
      request("/api/stats/top", { method: "GET" }),
    );
    assert.equal(
      publicApiProxyResponse.headers.get("cache-control"),
      null,
      "공개 읽기 API의 라우트별 캐시 정책을 공통 게이트가 덮어쓰면 안 됩니다.",
    );

    const authenticatedPublicApiResponse = await proxy(
      request("/api/stats/top", {
        method: "GET",
        headers: { cookie: "user_token=session-placeholder" },
      }),
    );
    assert.equal(
      authenticatedPublicApiResponse.headers.get("cache-control"),
      "private, no-store, max-age=0",
      "로그인 쿠키가 포함된 응답은 공유 캐시에 저장하면 안 됩니다.",
    );

    const personalizedApiResponse = await proxy(
      request("/api/participation/season", { method: "GET" }),
    );
    assert.equal(
      personalizedApiResponse.headers.get("cache-control"),
      "private, no-store, max-age=0",
      "사용자별 응답이 가능한 API는 비로그인 응답도 공유 캐시에서 제외해야 합니다.",
    );
  } finally {
    if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN_VALUE;
    else process.env.ADMIN_TOKEN_VALUE = originalAdminToken;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

Promise.all([checkProxyCachePolicy(), checkJsonBodyParser(), checkCsvStream()])
  .then(() => console.log("Security request guard checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
