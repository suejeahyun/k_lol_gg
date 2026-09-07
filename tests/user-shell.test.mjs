import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("사용자 shell은 skip target, landmark, modal search, 모바일 5개 진입점을 제공한다", async () => {
  const shell = await readFile(new URL("../src/components/site-shell.tsx", import.meta.url), "utf8");
  const navigation = await readFile(
    new URL("../src/components/navigation/user-site-navigation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /<main id="main-content">/);
  assert.match(shell, /<Suspense/);
  assert.match(navigation, /aria-haspopup="dialog"/);
  assert.match(navigation, /<dialog/);
  assert.match(navigation, /aria-current=/);
  assert.match(navigation, /className="mobile-nav"/);

  const mobileBlock = navigation.slice(
    navigation.indexOf("export function MobileUserNavigation"),
    navigation.indexOf("export function NavigationFallback"),
  );
  assert.equal((mobileBlock.match(/<Link/g) ?? []).length, 3);
  assert.equal((mobileBlock.match(/compact \/>/g) ?? []).length, 2);
});
test("V2 UI는 실제 운영 데이터가 없을 때 합성 샘플을 사용자 화면에 연결하지 않는다", async () => {
  const playerIndex = await readFile(new URL("../src/modules/players/index.ts", import.meta.url), "utf8");
  const playerPage = await readFile(
    new URL("../src/app/(public)/(registry)/players/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(playerIndex, /fixturePlayerRepository/);
  assert.match(playerPage, /샘플 플레이어를 만들어 보여주지 않습니다/);
});

test("사용자와 관리자 로그아웃 UI는 세션 폐기 성공 뒤에만 로그인 화면으로 이동한다", async () => {
  const accountLogout = await readFile(
    new URL("../src/components/accounts/account-logout-button.tsx", import.meta.url),
    "utf8",
  );
  const adminLogout = await readFile(
    new URL("../src/components/admin/admin-logout-button.tsx", import.meta.url),
    "utf8",
  );
  for (const [source, destination] of [
    [accountLogout, "/login"],
    [adminLogout, "/admin/login"],
  ]) {
    assert.match(source, /if \(!response\.ok\)/);
    assert.match(source, /setError\(/);
    assert.ok(source.indexOf("if (!response.ok)") < source.indexOf(`router.replace(\"${destination}\")`));
    assert.doesNotMatch(source, /finally\s*\{\s*router\.replace/);
  }
});

test("관리자 계정 상세는 저장소 장애를 존재하지 않음 404로 축소하지 않는다", async () => {
  const detailPage = await readFile(
    new URL("../src/app/(admin)/admin/users/[userAccountId]/page.tsx", import.meta.url),
    "utf8",
  );
  const detailError = await readFile(
    new URL("../src/app/(admin)/admin/users/[userAccountId]/error.tsx", import.meta.url),
    "utf8",
  );
  assert.match(detailPage, /await repository\.findAdmin\(id, viewerRole\)/);
  assert.doesNotMatch(detailPage, /findAdmin\([^\n]+\.catch\(\(\) => null\)/);
  assert.match(detailError, /계정이 없다는 뜻이 아닙니다/);
  assert.match(detailError, /window\.location\.reload\(\)/);
});

test("모바일 관리자 메뉴에서도 현재 역할과 안전한 로그아웃을 제공한다", async () => {
  const navigation = await readFile(
    new URL("../src/components/admin/admin-navigation.tsx", import.meta.url),
    "utf8",
  );
  const shell = await readFile(
    new URL("../src/components/admin/admin-shell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(navigation, /className=\{styles\.mobileAccount\}/);
  assert.match(navigation, /<AdminLogoutButton \/>/);
  assert.match(navigation, /현재 역할/);
  assert.match(shell, /<MobileAdminNavigation roleLabel=\{accountRoleLabel\(session\.role\)\} \/>/);
});

test("관리자 로그인 1단계는 존재하지 않는 TOTP 필드를 null로 보내지 않는다", async () => {
  const loginForm = await readFile(
    new URL("../src/components/auth/admin-login-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(loginForm, /typeof totpCode === "string" \? \{ totpCode \} : \{\}/);
  assert.doesNotMatch(loginForm, /totpCode:\s*formData\.get/);
});

test("계정 작업 UI는 stale revision에서 최신 projection을 읽고 안내를 유지한다", async () => {
  const adminActions = await readFile(
    new URL("../src/components/admin/accounts/admin-account-actions.tsx", import.meta.url),
    "utf8",
  );
  const detailPage = await readFile(
    new URL("../src/app/(admin)/admin/users/[userAccountId]/page.tsx", import.meta.url),
    "utf8",
  );
  const passwordForm = await readFile(
    new URL("../src/components/accounts/account-password-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminActions, /response\.status === 412/);
  assert.match(adminActions, /fetch\(`\/api\/admin\/users\/\$\{account\.id\}`/);
  assert.match(adminActions, /applyAccountProjection\(latest\)/);
  assert.match(adminActions, /최신값을 불러왔습니다/);
  assert.match(
    adminActions.slice(adminActions.indexOf("response.status === 412"), adminActions.indexOf("setMessage({ text: responseMessage(body)")),
    /router\.refresh\(\)/,
  );
  assert.match(adminActions, /ONE_TIME_SECRET_ALREADY_ISSUED/);
  assert.match(adminActions, /temporaryPasswordRef\.current = body\.temporaryPassword/);
  assert.match(adminActions, /latestRevisionRef\.current/);
  assert.match(adminActions, /shouldApplyRevisionProjection/);
  assert.match(adminActions, /temporaryPasswordRevisionRef\.current = responseRevision/);
  assert.match(adminActions, /secretMatchesLatestRevision/);
  assert.match(adminActions, /과거 revision 응답은 적용하지 않았습니다/);
  assert.match(adminActions, /\{ text: responseMessage\(body\), tone: "success" \}\);[\s\S]*router\.refresh\(\)/);
  assert.match(detailPage, /<AdminAccountActions key=\{account\.id\}/);
  assert.doesNotMatch(detailPage, /notice=|searchParams.*notice/);
  assert.match(passwordForm, /fetch\("\/api\/auth\/me"/);
  assert.match(passwordForm, /setCurrentRevision/);
  assert.match(passwordForm, /다시 로그인/);
  assert.match(passwordForm, /router\.replace\("\/login"\);[\s\S]*router\.refresh\(\)/);
});

test("일회성 비밀번호는 숨김·BFCache 복귀·명시적 닫기에서 메모리와 안내를 함께 종료한다", async () => {
  const adminActions = await readFile(
    new URL("../src/components/admin/accounts/admin-account-actions.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminActions, /temporaryPasswordRef\.current = null/);
  assert.match(adminActions, /setTemporaryPassword\(null\)/);
  assert.match(adminActions, /visibilitychange/);
  assert.match(adminActions, /pagehide/);
  assert.match(adminActions, /pageshow/);
  assert.match(adminActions, /clearWhenRestored[\s\S]*event\.persisted[\s\S]*pageHiddenSinceMountRef\.current[\s\S]*router\.refresh\(\)/);
  assert.match(adminActions, /secretRequestEpoch = secretLifecycleEpochRef\.current/);
  assert.match(adminActions, /canPresentOneTimeSecret\(\{/);
  assert.match(adminActions, /currentEpoch: secretLifecycleEpochRef\.current/);
  assert.match(adminActions, /visibilityState: document\.visibilityState/);
  assert.match(adminActions, /body\?\.temporaryPassword && !secretCanBePresented/);
  assert.match(adminActions, /화면을 벗어난 동안 발급이 완료되어/);
  assert.match(adminActions, /latestRevision: account\.revision,[\s\S]*projectionRevision: initialAccount\.revision/);
  assert.match(adminActions, /다시 확인할 수 없습니다/);
  const dismissBranch = adminActions.slice(
    adminActions.indexOf('clearTemporaryPassword("DISMISSED")'),
    adminActions.indexOf('clearTemporaryPassword("DISMISSED")') + 120,
  );
  assert.doesNotMatch(dismissBranch, /router\.refresh\(\)/);
});

test("내 계정 플레이어 탭은 대기 claim과 거절 claim을 구분한다", async () => {
  const accountPage = await readFile(
    new URL("../src/app/(public)/account/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(accountPage, /claim\.status === "PENDING"/);
  assert.match(accountPage, /claim\.status === "REJECTED"/);
  assert.match(accountPage, /연결 검토가 종료되었습니다/);
});

test("내 계정 상태 안내는 공개 사유가 없을 때도 상태별 기본 문구를 구분한다", async () => {
  const accountPage = await readFile(
    new URL("../src/app/(public)/account/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(accountPage, /PENDING: "관리자 검토를 기다리고 있습니다\."/);
  assert.match(accountPage, /APPROVED: "전체 사용자 기능을 사용할 수 있습니다\."/);
  assert.match(accountPage, /REJECTED: "계정 승인이 거절되었습니다\./);
  assert.match(accountPage, /SUSPENDED: "계정 이용이 제한되어 있습니다\./);
  assert.match(accountPage, /defaultStatusMessages\[account\.status\]/);
  assert.match(accountPage, /formatOptionalKoreanDateTime/);
});

test("계정 시각은 공통 Asia/Seoul 24시간 포맷터를 사용한다", async () => {
  const accountPage = await readFile(
    new URL("../src/app/(public)/account/page.tsx", import.meta.url),
    "utf8",
  );
  const adminDetail = await readFile(
    new URL("../src/app/(admin)/admin/users/[userAccountId]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(accountPage, /formatOptionalKoreanDateTime/);
  assert.match(adminDetail, /formatKoreanDateTime\(account\.adminTotpEnabledAt\)/);
  assert.doesNotMatch(adminDetail, /toLocaleString\("ko-KR"\)/);
});

test("가입·본인 비밀번호 변경 UI는 성공과 pagehide에서 비밀번호 fingerprint ref를 즉시 비운다", async () => {
  const authForms = await readFile(
    new URL("../src/components/accounts/account-auth-forms.tsx", import.meta.url),
    "utf8",
  );
  const passwordForm = await readFile(
    new URL("../src/components/accounts/account-password-form.tsx", import.meta.url),
    "utf8",
  );
  for (const source of [authForms, passwordForm]) {
    assert.match(source, /window\.addEventListener\("pagehide", clearSensitiveFingerprint\)/);
    assert.match(source, /idempotency\.current = null/);
  }
  assert.match(authForms, /if \(!response\.ok\)[\s\S]*idempotency\.current = null;[\s\S]*가입 신청이 접수되었습니다/);
  assert.match(passwordForm, /idempotency\.current = null;[\s\S]*비밀번호가 변경되었습니다/);
});
