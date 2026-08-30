import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  canManageAccountApproval,
  canViewPrivateAsset,
  isAdminRole,
  isAdminTwoFactorReady,
} from "../src/lib/auth/admin-security-policy";
import { signAuthToken, verifyAuthToken } from "../src/lib/auth/token";
import { getDeployEnvWarnings, isDeployEnvReady } from "../src/lib/security/deploy-env";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

assert.equal(isAdminRole("ADMIN"), true);
assert.equal(isAdminRole("SUPER_ADMIN"), true);
assert.equal(isAdminRole("USER"), false);

assert.equal(
  isAdminTwoFactorReady({
    role: "ADMIN",
    adminTotpEnabled: true,
    tokenTotpVerified: true,
  }),
  true,
  "관리자 권한은 DB 활성화와 현재 토큰의 2FA 검증을 모두 요구해야 합니다.",
);
assert.equal(
  isAdminTwoFactorReady({
    role: "ADMIN",
    adminTotpEnabled: false,
    tokenTotpVerified: true,
  }),
  false,
);
assert.equal(
  isAdminTwoFactorReady({
    role: "SUPER_ADMIN",
    adminTotpEnabled: true,
    tokenTotpVerified: false,
  }),
  false,
);

assert.equal(canManageAccountApproval("ADMIN", "USER"), true);
assert.equal(canManageAccountApproval("ADMIN", "ADMIN"), false);
assert.equal(canManageAccountApproval("ADMIN", "SUPER_ADMIN"), false);
assert.equal(canManageAccountApproval("SUPER_ADMIN", "ADMIN"), true);
assert.equal(canManageAccountApproval("SUPER_ADMIN", "SUPER_ADMIN"), false);

assert.equal(canViewPrivateAsset("ADMIN", "INHOUSE_RESULT"), true);
assert.equal(canViewPrivateAsset("ADMIN", "DISCIPLINE_RESOLUTION"), true);
assert.equal(canViewPrivateAsset("ADMIN", "DISCIPLINE_ISSUE"), true);
assert.equal(canViewPrivateAsset("ADMIN", "UNSCOPED_PRIVATE_FILE"), false);
assert.equal(canViewPrivateAsset("SUPER_ADMIN", "DISCIPLINE_ISSUE"), true);

Object.assign(process.env, {
  DATABASE_URL: "postgresql://security-test.invalid/database",
  NEXT_PUBLIC_BASE_URL: "https://security-test.invalid",
  JWT_SECRET: "security-test-jwt-secret-at-least-32-characters",
  TOTP_ENCRYPTION_KEY: "security-test-totp-key-at-least-32-characters",
  SUPER_ADMIN_ID: "security-test-admin",
  SUPER_ADMIN_PASSWORD: "security-test-password-strong",
  CRON_SECRET: "security-test-cron-secret",
  PRIVACY_CONTACT: "security@example.invalid",
  KAKAO_OPENCHAT_SECRET: "security-test-openchat",
  KAKAO_SEARCH_PLAYER_SECRET: "security-test-player",
  KAKAO_RECRUIT_SECRET: "security-test-recruit",
  ALLOW_LEGACY_ADMIN_TOKEN: "false",
});

assert.equal(isDeployEnvReady(), true, "안전한 테스트 환경은 배포 준비 상태여야 합니다.");
process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
assert.equal(isDeployEnvReady(), false, "레거시 관리자 토큰 플래그가 켜지면 배포 준비가 실패해야 합니다.");
assert.equal(
  getDeployEnvWarnings().some((warning) => warning.key === "ALLOW_LEGACY_ADMIN_TOKEN"),
  true,
);

const readinessTemp = mkdtempSync(resolve(tmpdir(), "klol-admin-security-"));
try {
  const runDeployCheck = (allowLegacy: string) => spawnSync(
    process.execPath,
    [resolve(root, "tools/check-deploy-readiness.mjs")],
    {
      cwd: readinessTemp,
      env: { ...process.env, ALLOW_LEGACY_ADMIN_TOKEN: allowLegacy },
      encoding: "utf8",
    },
  );
  const safeDeploy = runDeployCheck("false");
  const legacyDeploy = runDeployCheck("true");
  assert.equal(safeDeploy.status, 0, safeDeploy.stderr || safeDeploy.stdout);
  assert.equal(legacyDeploy.status, 1, "레거시 관리자 토큰 플래그는 CLI 배포 점검도 실패시켜야 합니다.");
  assert.match(legacyDeploy.stderr, /ALLOW_LEGACY_ADMIN_TOKEN/);
} finally {
  rmSync(readinessTemp, { recursive: true, force: true });
}

const verifiedToken = verifyAuthToken(signAuthToken({
  userAccountId: 1,
  role: "ADMIN",
  status: "APPROVED",
  adminTotpVerified: true,
}));
const enrollmentToken = verifyAuthToken(signAuthToken({
  userAccountId: 1,
  role: "ADMIN",
  status: "APPROVED",
  adminTotpVerified: false,
}));
assert.equal(verifiedToken?.adminTotpVerified, true);
assert.equal(enrollmentToken?.adminTotpVerified, false);

const authConstants = read("src/lib/auth.ts");
const requireAdmin = read("src/lib/auth/requireAdmin.ts");
const proxy = read("src/proxy.ts");
const adminLogin = read("src/app/api/admin/login/route.ts");
const userLogin = read("src/app/api/auth/login/route.ts");
const logRoute = read("src/app/api/admin/logs/route.ts");
const logStatsRoute = read("src/app/api/admin/logs/stats/route.ts");
const approveRoute = read("src/app/api/admin/users/[userAccountId]/approve/route.ts");
const rejectRoute = read("src/app/api/admin/users/[userAccountId]/reject/route.ts");
const privateAssetRoute = read("src/app/api/admin/private-assets/[id]/route.ts");
const deployCheck = read("tools/check-deploy-readiness.mjs");
const schema = read("prisma/schema.prisma");

assert.doesNotMatch(authConstants, /ADMIN_TOKEN_VALUE/);
assert.doesNotMatch(requireAdmin, /ADMIN_TOKEN_VALUE|legacy-admin/);
assert.doesNotMatch(proxy, /ADMIN_TOKEN_VALUE|ALLOW_LEGACY_ADMIN_TOKEN/);
assert.match(requireAdmin, /!user\.adminTotpEnabled/);
assert.match(proxy, /twoFactorEnrollmentRequired/);

assert.match(adminLogin, /if \(!validTotp\.ok\)/);
assert.match(adminLogin, /consumeAdminTotpStep/);
assert.match(adminLogin, /adminTotpVerified:\s*user\.adminTotpEnabled/);
assert.match(userLogin, /adminTotpVerified:\s*false/);

assert.match(logRoute, /rejectIfNotSuperAdmin/);
assert.match(logStatsRoute, /rejectIfNotSuperAdmin/);
assert.match(approveRoute, /canManageAccountApproval/);
assert.match(rejectRoute, /canManageAccountApproval/);

assert.match(privateAssetRoute, /canViewPrivateAsset/);
assert.match(privateAssetRoute, /PRIVATE_ASSET_VIEW_DENIED/);
assert.match(privateAssetRoute, /PRIVATE_ASSET_VIEW/);

assert.match(deployCheck, /ALLOW_LEGACY_ADMIN_TOKEN/);
assert.match(deployCheck, /addProblem\("ALLOW_LEGACY_ADMIN_TOKEN/);
assert.doesNotMatch(deployCheck, /"ADMIN_TOKEN_VALUE"/);
assert.match(schema, /adminTotpLastUsedStep\s+BigInt\?/);
assert.equal(
  existsSync(resolve(root, "prisma/migrations/20260830103000_enforce_admin_totp_assurance/migration.sql")),
  true,
  "TOTP 재사용 방지 필드 마이그레이션이 있어야 합니다.",
);

console.log("Admin security policy checks passed.");
