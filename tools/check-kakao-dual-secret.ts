import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { NextRequest } from "next/server";
import { isAuthorizedKakaoRequest } from "../src/lib/kakao/request-auth";
import {
  getRequiredSecretCandidatesInProduction,
  getSecretCandidates,
  matchesRequestSecret,
} from "../src/lib/security/secrets";

const managedKeys = [
  "NODE_ENV",
  "KAKAO_RECRUIT_SECRET",
  "KAKAO_RECRUIT_SECRET_NEXT",
  "KAKAO_SEARCH_PLAYER_SECRET",
  "KAKAO_SEARCH_PLAYER_SECRET_NEXT",
] as const;
const originalEnv = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));
const mutableEnv = process.env as Record<string, string | undefined>;

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://k-lol-gg.example/api/kakao/recruit/season-apply", { headers });
}

function runDeployReadiness(overrides: Record<string, string | undefined> = {}) {
  const sentinel = "DualSecretSynthetic9x7p";
  const baseEnv: Record<string, string | undefined> = {
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PATH: process.env.PATH,
    Path: process.env.Path,
    NODE_ENV: "production",
    DEPLOY_ENV: "production",
    DATABASE_URL: "postgresql://qa.invalid/qa?sslmode=require",
    NEXT_PUBLIC_BASE_URL: "https://qa.invalid",
    JWT_SECRET: `qa-only-jwt-${sentinel}-32chars`,
    TOTP_ENCRYPTION_KEY: `qa-only-totp-${sentinel}-32bytes`,
    SUPER_ADMIN_ID: "qa-admin",
    SUPER_ADMIN_PASSWORD: `qa-only-admin-${sentinel}`,
    CRON_SECRET: `qa-only-cron-${sentinel}`,
    PRIVACY_CONTACT: "privacy-qa@example.invalid",
    KAKAO_OPENCHAT_SECRET: `qa-only-openchat-${sentinel}`,
    KAKAO_SEARCH_PLAYER_SECRET: `qa-only-search-${sentinel}`,
    KAKAO_SEARCH_PLAYER_SECRET_NEXT: `qa-only-search-next-${sentinel}`,
    KAKAO_RECRUIT_SECRET: `qa-only-recruit-${sentinel}`,
    KAKAO_RECRUIT_SECRET_NEXT: `qa-only-recruit-next-${sentinel}`,
    SECURITY_REQUIRE_KAKAO_SECRET: "true",
    ...overrides,
  };
  const result = spawnSync(process.execPath, ["tools/check-deploy-readiness.mjs", "--process-env-only"], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries(baseEnv).filter(([, value]) => value !== undefined)) as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(output.includes(sentinel), false, "배포 검증 출력에 합성 비밀값이 노출되면 안 됩니다.");
  return result;
}

try {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.KAKAO_RECRUIT_SECRET = "qa-recruit-active-only";
  delete mutableEnv.KAKAO_RECRUIT_SECRET_NEXT;

  const activeOnly = getRequiredSecretCandidatesInProduction("KAKAO_RECRUIT_SECRET");
  assert.equal(activeOnly.length, 1);
  assert.equal(matchesRequestSecret(activeOnly, { headers: ["qa-recruit-active-only"] }), true);
  assert.equal(isAuthorizedKakaoRequest(request({ "x-kakao-recruit-secret": "qa-recruit-active-only" }), null), true);

  mutableEnv.KAKAO_RECRUIT_SECRET_NEXT = "qa-recruit-next-overlap";
  const overlap = getRequiredSecretCandidatesInProduction("KAKAO_RECRUIT_SECRET");
  assert.equal(overlap.length, 2);
  assert.equal(matchesRequestSecret(overlap, { headers: ["qa-recruit-active-only"] }), true);
  assert.equal(matchesRequestSecret(overlap, { headers: ["qa-recruit-next-overlap"] }), true);
  assert.equal(isAuthorizedKakaoRequest(request({ "x-kakao-recruit-secret": "qa-recruit-next-overlap" }), null), true);
  assert.equal(matchesRequestSecret(overlap, { headers: ["qa-unrecognized-credential"] }), false);

  mutableEnv.KAKAO_RECRUIT_SECRET_NEXT = "";
  assert.deepEqual(getSecretCandidates("KAKAO_RECRUIT_SECRET"), []);
  assert.throws(() => getRequiredSecretCandidatesInProduction("KAKAO_RECRUIT_SECRET"));

  mutableEnv.KAKAO_RECRUIT_SECRET_NEXT = mutableEnv.KAKAO_RECRUIT_SECRET;
  assert.deepEqual(getSecretCandidates("KAKAO_RECRUIT_SECRET"), []);
  assert.throws(() => getRequiredSecretCandidatesInProduction("KAKAO_RECRUIT_SECRET"));

  mutableEnv.KAKAO_SEARCH_PLAYER_SECRET = "qa-search-active-only";
  mutableEnv.KAKAO_SEARCH_PLAYER_SECRET_NEXT = "qa-search-next-overlap";
  const searchOverlap = getRequiredSecretCandidatesInProduction("KAKAO_SEARCH_PLAYER_SECRET");
  assert.equal(matchesRequestSecret(searchOverlap, { headers: ["qa-search-active-only"] }), true);
  assert.equal(matchesRequestSecret(searchOverlap, { headers: ["qa-search-next-overlap"] }), true);

  const routeContracts = [
    "src/lib/kakao/request-auth.ts",
    "src/app/api/kakao/search-player/route.ts",
    "src/app/api/kakao/recruit/season-apply/route.ts",
    "src/app/api/kakao/recruit/season-apply/status/route.ts",
    "src/app/api/kakao/operation-forms/route.ts",
    "src/app/api/kakao/party-recruits/_shared.ts",
    "src/app/api/kakao/destruction-scrim-recruits/_shared.ts",
  ];
  for (const relativePath of routeContracts) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
    assert.match(source, /getRequiredSecretCandidatesInProduction/);
  }

  const botTemplate = fs.readFileSync(
    path.join(process.cwd(), "docs/operations/kakao-dual-secret-bot-opt-in.template.js"),
    "utf8",
  );
  assert.match(botTemplate, /KLOL_KAKAO_USE_RECRUIT_NEXT_SECRET = false/);
  assert.match(botTemplate, /KLOL_KAKAO_USE_SEARCH_NEXT_SECRET = false/);
  assert.doesNotMatch(botTemplate, /console\.|Log\.|Api\.replyRoom/);

  const positive = runDeployReadiness();
  assert.equal(positive.status, 0, positive.stderr);

  const activeOnlyDeploy = runDeployReadiness({
    KAKAO_RECRUIT_SECRET_NEXT: undefined,
    KAKAO_SEARCH_PLAYER_SECRET_NEXT: undefined,
  });
  assert.equal(activeOnlyDeploy.status, 0, activeOnlyDeploy.stderr);

  for (const overrides of [
    { KAKAO_RECRUIT_SECRET_NEXT: "" },
    { KAKAO_RECRUIT_SECRET_NEXT: "qa-only-recruit-DualSecretSynthetic9x7p" },
    { SECURITY_REQUIRE_KAKAO_SECRET: "false" },
  ]) {
    const negative = runDeployReadiness(overrides);
    assert.notEqual(negative.status, 0, "잘못된 Production 중첩 구성은 배포 검증에서 차단되어야 합니다.");
  }

  console.log("[kakao-dual-secret] PASS: active-only, overlap, fail-closed, validator, and disabled caller opt-in contracts");
} finally {
  for (const key of managedKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
}
