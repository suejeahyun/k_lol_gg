# V2 S03 시즌·참가 QA 보고서

- 작업 브랜치: `feature/v2-seasons-participation-s03`
- 최초 기준: `426d317326bb9fcceb292c67bac5390fa340c63a`
- S01/S02 rebase 기준: `a9811ff08ead6b05114510c111f6c00892e23ba8`
- 검증일: 2026-09-01 (Asia/Seoul)
- 운영 반영·Git push·Vercel: 없음
- 외부 API·실계정·운영 DB·비밀 접근: 없음

## 구현 범위

- S03-only forward migration `0003`과 시즌·참가·receipt aggregate
- 단일 ACTIVE, 수명주기, nullable legacy ID, SITE/KAKAO identity dedupe, review/position check
- `/applications` 공개·세션 UI와 canonical 공개 API 4개
- `/admin/seasons` 실제 DB workspace와 season lifecycle/application review API
- owner/revision/idempotency/origin/strict body·query/problem+json/no-store 계약
- 신청·취소 12회/600초 DB rate limit과 fail-close
- 업무 필드 before/after audit, 24시간 receipt와 opportunistic cleanup
- V1 `/participation{,/season}`의 GET/HEAD-only canonical 308

## 자동 검증

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run test:unit` | 84/84 통과 |
| `npm run test:db` | 단독 2회 연속 통과. 각 회 PostgreSQL 18 base 8/8, TOTP 6/6, S02 1/1, S03 18/18와 durable auth·TOTP·player·season 실제 HTTP 통과 |
| `npm run check` | lint, typecheck, JS 계약 6/6, TS unit 84/84, Next build 21/21 통과 |
| `npm run verify:auth-http` | guards·limits·password+TOTP·cookie·roles·headers·logout·production fixture lockout 통과 |
| `npm run security:secrets` | 현재 tree·전체 Git history 고신뢰 비밀 패턴 0; 최종 커밋 뒤 동일 검사 재실행 |
| `npm audit --omit=dev` | 취약점 0 |
| `npm audit` | 기존 개발 도구 transitive esbuild advisory 4 moderate. 해결은 drizzle-kit 강제 breaking downgrade를 요구하므로 이 슬라이스에서 강제 수정하지 않음 |

PostgreSQL 검증에는 migration/idempotency, 단일 활성화 경쟁, RETIRED 정확 timestamp 거부, clone,
owner cancel, review·재검토 race,
Kakao hash/identity dedupe, exact review/position check, soft-delete TOCTOU 차단, audit 실패 rollback,
24시간 receipt, 201명 전체 count를 포함한다. 실제 HTTP는 401/403, CSRF, media/size/unknown key,
bidi/control, canonical no-query, KST ISO, idempotency replay/mismatch, stale If-Match, 404/409/412,
public privacy, POST/DELETE rate boundary와 rate store 장애 503을 포함한다.

## 브라우저 QA

합성 ADMIN+TOTP, 합성 player/application과 일회성 PostgreSQL 18만 사용했다. KST 입력 계약은 DB
instant와 관리자 표시 `2026. 09. 02. 10:00`(Asia/Seoul)을 대조했다. Next 개발 서버 캡처이므로
운영 반영 증거가 아니다.

정확한 canonical 증거 파일:

- `screenshots/applications-ready-layout-client-1440-scrollbar-15.jpg`
- `screenshots/applications-ready-layout-client-320-scrollbar-15.jpg`
- `screenshots/applications-ready-layout-client-375-scrollbar-15.jpg`
- `screenshots/applications-ready-layout-client-390-scrollbar-15.jpg`
- `screenshots/applications-empty-layout-client-1440-scrollbar-15.jpg`
- `screenshots/applications-empty-layout-client-390-scrollbar-15.jpg`
- `screenshots/applications-error-layout-client-1440-scrollbar-15.jpg`
- `screenshots/applications-error-layout-client-390-scrollbar-15.jpg`
- `screenshots/admin-seasons-ready-layout-client-1440-scrollbar-15.jpg`
- `screenshots/admin-seasons-review-layout-client-1440-scrollbar-15.jpg`
- `screenshots/admin-seasons-review-layout-client-320-scrollbar-15.jpg`
- `screenshots/admin-seasons-review-layout-client-375-scrollbar-15.jpg`
- `screenshots/admin-seasons-review-layout-client-390-scrollbar-15.jpg`
- `screenshots/admin-seasons-login-required-client-1440.jpg`
- `screenshots/VIEWPORT-METRICS.json`

Windows Codex IAB의 scrollable page는 JPEG 오른쪽 15px에 classic scrollbar를 그린다. 숨김 CSS를
제품에 넣지 않고 파일명에 `layout-client-*`와 `scrollbar-15`를 명시했다. metrics JSON은 캡처 직전
`outerWidth`, `innerWidth`, `documentElement.clientWidth/scrollWidth`, `visualViewport.width`, DPR,
screenshot 실제 폭과 OS scrollbar를 기록한다. 320/375/390 모두 CSS client·visual·document
scroll width가 target과 같고 page-level horizontal overflow는 0이다.

관리자 검토 queue는 모바일에서 카드 안의 검토 버튼이 직접 보인다. 1440에서는 review region
`clientWidth=scrollWidth=1036`, 첫 버튼 rect `x=1288.6..1361.2`, visual viewport 1440으로 검토
action 전체가 panel 안에 들어온다.

## 공개 정보 검증

공개 DTO를 직렬화해 다음 문자열·field가 0임을 확인했다.

- 회원명과 `memberName`
- `loginId`
- Discord 관련 field
- `reviewNote`, reviewer와 내부 provenance

관리자 workspace에서만 회원명과 검토 메모를 사용한다.

## 작업 중 발견 후 수정

1. 무오프셋 `datetime-local`의 서버 timezone 의존을 제거하고 명시적 KST instant만 허용했다.
2. UI 재시도마다 바뀌던 idempotency key를 action+revision+payload fingerprint 성공 전까지 유지했다.
3. receipt에 24시간 TTL/index/cleanup을 추가했다.
4. strict body/query와 Unicode bidi control 차단을 모든 S03 canonical route에 맞췄다.
5. reviewer FK/check 모순, SITE/KAKAO source hash 의미, ALL/부라인 혼합, soft-delete TOCTOU를 수정했다.
6. 거절 신청 재접수와 검토 상태 취소를 막고 APPLIED-only 정책으로 고정했다.
7. 참가자 projection 200행과 전체 상태 count를 분리해 201명 이상 집계를 바로잡았다.
8. 모바일 검토 action을 가로 표 밖이 아닌 카드 안에 노출하고 1440 표의 숨은 검토 열도 제거했다.
9. 감사 before/after에 시즌 기간과 application 라인·source·status·review field를 추가했다.
10. 시즌 `PATCH`가 빠진 날짜를 암묵적으로 지우지 않도록 5개 편집 field exact-required로 고정하고,
    누락 요청 400과 DB·audit 불변을 실제 HTTP로 확인했다.
11. TOTP rate-limit HTTP 검증이 5분 고정 버킷 경계를 우연히 가로지르던 비결정성을 확인했다.
    최소 30초가 남은 동일 버킷에서 8회 허용·9회 429를 검증하도록 격리했고 전체 DB/HTTP를
    연속 두 번 통과시켰다. 계정·cookie·CSRF·role·bucket 공유 누수는 없었다.

관리자 검토 정책은 사용자 검토 후 잠금과 다르다. 사용자는 검토 완료 상태를 수정·취소할 수 없지만,
관리자는 strong revision과 새 감사 event를 사용해 `CONFIRMED/RESERVE/REJECTED` 사이 결정을 재검토할
수 있다. 실제 HTTP에서 `RESERVE → REJECTED`, stale revision 412와 before/after audit을 확인했다.

## 정확한 미완료·출시 경계

- S09 실제 Kakao webhook/snapshot ingest, 미매칭 pending, 예비·다회차 snapshot, 관리자 매칭은 없다.
  S03은 source enum/hash/identity dedupe DB 기반만 완료했다.
- S01 제한 session은 S03 viewer DB status 재검사만 선반영됐다. 실제 제한 session 수명주기와
  session-purpose transaction guard는 S01 통합 범위다.
- route 권한 검사 뒤 admin session revoke/role/status/TOTP가 변하는 공통 TOCTOU를 S01 guard로
  S02/S03에 retrofit하고 race 검증하기 전에는 최종 GO·push가 금지된다.
- S13 mutation이 없는 환경의 receipt scheduler와 보존량 모니터링은 없다.
- 사용자 취소는 현재 APPLIED-only다. 다른 상태 취소 확장은 별도 정책 승인과 감사 계약이 필요하다.
- 운영 V1 legacy/source import, count/hash/invariant와 rollback 리허설은 실행하지 않았다.
- Vercel과 운영 DB에는 반영하지 않았다.

## 다음 권장 5개

1. S01 공통 transaction auth guard를 S02/S03에 통합하고 revoke/role/TOTP race를 실제 HTTP로 검증
2. S09 Kakao snapshot ingest·미매칭·다회차·관리자 매칭 adapter 구현
3. 운영 전 V1 legacy/source 승인 import와 count/hash/invariant·복구 리허설
4. S13 receipt scheduler와 rate-limit/receipt 보존량 관측
5. 참가자 201명 이상 공개 pagination 또는 점진 로딩 UX

이 보고서는 SITE 시즌·참가 aggregate의 로컬 후보 증거이며 Kakao 전체 동등성, V2 전체 완성,
운영 준비 또는 배포 완료를 뜻하지 않는다.
