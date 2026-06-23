#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const generatedDir = path.join(root, 'docs', 'audit', 'generated');
const inputPath = path.join(generatedDir, 'KLOL_PROJECT_AUDIT.json');
const mdPath = path.join(generatedDir, 'KLOL_SMOKE_TEST_PLAN.md');
const psPath = path.join(generatedDir, 'KLOL_SMOKE_TEST_PUBLIC_READ.ps1');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`audit json not found: ${filePath}\nRun npm run audit:project first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function classify(route) {
  const auth = route.auth || [];
  if (auth.includes('disabled/410')) return 'disabled';
  if (auth.includes('bearer/secret')) return 'bot-secret';
  if (auth.includes('requireAdmin')) return 'admin';
  if (auth.includes('session/user')) return 'session';
  if (auth.includes('public/read')) return 'public-read';
  if ((route.methods || []).includes('GET')) return 'public-or-unknown-get';
  return 'manual-review';
}

function toConcreteSmokeRoute(route) {
  if (route === '/api/community/headlines') return '/api/community/headlines?type=FREE';
  if (route === '/api/seasons/[seasonId]/current') return null;
  if (route.includes('[') || route.includes(']')) return null;
  return route;
}

const audit = readJson(inputPath);
const apiRoutes = audit.apiRoutes || [];
const pageRoutes = audit.pageRoutes || [];
const publicGetApis = apiRoutes.filter((r) => (r.methods || []).includes('GET') && ['public-read', 'public-or-unknown-get'].includes(classify(r)));
const publicSmokeRoutes = publicGetApis.map((r) => ({ ...r, smokeRoute: toConcreteSmokeRoute(r.route) }));
const safePages = pageRoutes.filter((p) => ['/', '/install', '/app', '/players', '/matches', '/rankings', '/recruits'].includes(p.route) || p.route.startsWith('/app/'));

const grouped = {};
for (const route of apiRoutes) {
  const key = classify(route);
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(route);
}

const lines = [];
lines.push('# K-LOL.GG Smoke Test Plan');
lines.push('');
lines.push('> 기능 변경 없이, 현재 라우트 기준으로 안전하게 확인할 수 있는 테스트 순서를 정리한 문서입니다.');
lines.push('');
lines.push('## 1. 실행 전제');
lines.push('');
lines.push('| 항목 | 값 |');
lines.push('| --- | --- |');
lines.push('| 원본 감사 생성 시각 | ' + escapeMd(audit.generatedAt) + ' |');
lines.push('| 전체 API route | ' + apiRoutes.length + ' |');
lines.push('| 전체 page route | ' + pageRoutes.length + ' |');
lines.push('| public GET 후보 | ' + publicGetApis.length + ' |');
lines.push('');
lines.push('## 2. 권한 분류별 API 수');
lines.push('');
lines.push('| 분류 | 개수 | 설명 |');
lines.push('| --- | ---: | --- |');
const desc = {
  'public-read': '공개 조회로 의도된 API',
  'public-or-unknown-get': 'GET이지만 public/read 표기가 명확하지 않은 API',
  session: '로그인 세션 필요',
  admin: '관리자 권한 필요',
  'bot-secret': '카카오톡/디스코드 봇 secret 필요',
  disabled: '비활성/410 처리 endpoint',
  'manual-review': '수동 확인 필요',
};
for (const key of Object.keys(grouped).sort()) {
  lines.push(`| ${escapeMd(key)} | ${grouped[key].length} | ${escapeMd(desc[key] || '')} |`);
}
lines.push('');
lines.push('## 3. Public GET API 확인');
lines.push('');
lines.push('아래 API는 브라우저 또는 PowerShell `Invoke-WebRequest`로 상태코드를 먼저 확인할 수 있습니다.');
lines.push('`/api/community/headlines`는 게시판 유형 파라미터가 필수이므로 smoke test에서는 `?type=FREE`로 확인합니다.');
lines.push('');
lines.push('| API | Smoke 확인 URL | Method | 파일 | 예상 |');
lines.push('| --- | --- | --- | --- | --- |');
for (const route of publicSmokeRoutes) {
  const smoke = route.smokeRoute || (route.route === '/api/seasons/[seasonId]/current' ? '/api/seasons/{SeasonId}/current' : '수동 확인');
  lines.push(`| ${escapeMd(route.route)} | ${escapeMd(smoke)} | GET | ${escapeMd(route.file)} | 200/2xx JSON 또는 의도된 empty 결과 |`);
}
lines.push('');
lines.push('## 4. 관리자 화면 우선 확인 순서');
lines.push('');
lines.push('| 순서 | 페이지 | 확인 포인트 |');
lines.push('| ---: | --- | --- |');
const adminChecks = [
  ['/admin', '대시보드 로딩, 주요 카운트, 관리자 권한 유지'],
  ['/admin/users', '유저 목록, 승인/거절/권한/비밀번호 초기화 버튼 노출'],
  ['/admin/recruits', '구인현황, 자동종료 설정, 초기화 버튼'],
  ['/admin/discord', '봇 상태, 음성방 현황, 구인 검증 요약'],
  ['/admin/matches', '내전 목록, 상세 이동'],
  ['/admin/matches/new', '내전 등록 폼, 참가자/챔피언 선택'],
  ['/admin/progress/destruction', '멸망전 목록, 경매/진행 상태'],
  ['/admin/operation-forms', '지인/건의/모임/외출 접수 목록'],
];
adminChecks.forEach(([route, check], idx) => lines.push(`| ${idx + 1} | ${route} | ${escapeMd(check)} |`));
lines.push('');
lines.push('## 5. 모바일 APP 확인 순서');
lines.push('');
lines.push('| 순서 | 페이지 | 확인 포인트 |');
lines.push('| ---: | --- | --- |');
const appChecks = [
  ['/app', 'PC 화면 이탈 없이 모바일 홈 표시'],
  ['/app/me', '내정보, 계정관리, 디스코드 연동/해제'],
  ['/app/players', '플레이어 검색/목록/상세 이동'],
  ['/app/matches', '내전 목록/상세 표시'],
  ['/app/recruits', '구인현황 표시'],
  ['/app/admin', '관리자 전용 홈 표시'],
  ['/app/admin/discord', '디스코드 요약 표시'],
];
appChecks.forEach(([route, check], idx) => lines.push(`| ${idx + 1} | ${route} | ${escapeMd(check)} |`));
lines.push('');
lines.push('## 6. 카카오톡 명령어 확인 순서');
lines.push('');
lines.push('| 순서 | 명령/양식 | 웹 API | 기대값 |');
lines.push('| ---: | --- | --- | --- |');
const kakaoMap = audit.kakaoMapping || [];
kakaoMap.forEach((item, idx) => {
  lines.push(`| ${idx + 1} | ${escapeMd((item.commands || []).join(', '))} | ${escapeMd(item.route)} | ${item.exists ? '2xx + reply 반환' : '누락'} |`);
});
lines.push('');
lines.push('## 7. 자동 생성 PowerShell');
lines.push('');
lines.push('`docs/audit/generated/KLOL_SMOKE_TEST_PUBLIC_READ.ps1` 파일은 공개 GET 후보만 확인합니다. 로그인/관리자/봇 secret API는 직접 호출하지 않습니다.');
lines.push('동적 route `/api/seasons/[seasonId]/current`는 `-SeasonId` 인자를 줄 때만 확인합니다.');
lines.push('');

const psLines = [];
psLines.push('param(');
psLines.push('  [string]$BaseUrl = "http://localhost:3000",');
psLines.push('  [int]$TimeoutSec = 20,');
psLines.push('  [string]$SeasonId = ""');
psLines.push(')');
psLines.push('');
psLines.push('$ErrorActionPreference = "Continue"');
psLines.push('$base = $BaseUrl.TrimEnd("/")');
psLines.push('');
psLines.push('$routes = @(');
for (const route of publicSmokeRoutes) {
  if (!route.smokeRoute) continue;
  psLines.push(`  "${route.smokeRoute}",`);
}
psLines.push(')');
psLines.push('');
psLines.push('if ($SeasonId -and $SeasonId.Trim().Length -gt 0) {');
psLines.push('  $routes += ("/api/seasons/{0}/current" -f $SeasonId.Trim())');
psLines.push('}');
psLines.push('');
psLines.push('$failed = 0');
psLines.push('');
psLines.push('foreach ($route in $routes) {');
psLines.push('  $url = $base + $route');
psLines.push('  try {');
psLines.push('    $res = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing');
psLines.push('    $code = [int]$res.StatusCode');
psLines.push('    if ($code -ge 200 -and $code -lt 300) {');
psLines.push('      Write-Host ("[OK] {0} {1}" -f $code, $route)');
psLines.push('    } else {');
psLines.push('      Write-Host ("[CHECK] {0} {1}" -f $code, $route)');
psLines.push('      $failed++');
psLines.push('    }');
psLines.push('  } catch {');
psLines.push('    $code = $null');
psLines.push('    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {');
psLines.push('      try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = $null }');
psLines.push('    }');
psLines.push('    $displayCode = "ERR"');
psLines.push('    if ($null -ne $code) { $displayCode = $code }');
psLines.push('    Write-Host ("[FAIL] {0} {1} - {2}" -f $displayCode, $route, $_.Exception.Message)');
psLines.push('    $failed++');
psLines.push('  }');
psLines.push('}');
psLines.push('');
psLines.push('if ($failed -gt 0) {');
psLines.push('  Write-Host ("Smoke test finished with {0} failed/check item(s)." -f $failed)');
psLines.push('  exit 1');
psLines.push('}');
psLines.push('');
psLines.push('Write-Host "Smoke test finished successfully."');
psLines.push('exit 0');

fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
fs.writeFileSync(psPath, psLines.join('\n'), 'utf8');
console.log(`Wrote ${path.relative(root, mdPath)}`);
console.log(`Wrote ${path.relative(root, psPath)}`);