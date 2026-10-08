# 내전 팀 편성 점수 관리자 권한과 화면 개선

- 기능 버전: `team-balance-admin@1.0.0`
- 확인일: 2026-10-08 (Asia/Seoul)
- 상태: `NOT_DEPLOYED` - 로컬 소스와 검증만 존재하며 운영 배포하지 않음
- Git commit/tag: 이 변경을 위한 commit과 tag는 생성하지 않음
- migration head: `0047_usage_analytics`; 스키마와 migration 변경 없음
- [한국어 패치 노트](../../patch-notes/2026-10-08-team-balance-admin.md)

## 변경 범위

`/admin/balance-ai`의 팀 편성 전용 보정을 일반 관리자 `ADMIN`과 최고 관리자 `SUPER_ADMIN`이 조회하고 저장할 수 있다. 승인된 계정의 유효한 관리자 목적 세션이 필요하며, `USER`와 일반 사이트 로그인용 `ACCOUNT` 세션은 허용하지 않는다. MMR 조정 원장 추가와 재계산은 계속 `SUPER_ADMIN` 전용이다.

내전 팀 편성 점수 편집을 페이지 상단으로 이동했다. 닉네임 또는 Riot ID로 플레이어를 선택하면 현재 점수를 자동 조회하고, 저장 전후 점수와 최근 저장 시각을 보여준다. 0점 초기화, 변경 사유 입력, 저장 완료 안내, 충돌 후 최신 점수 재조회, 저장 결과가 불확실할 때 같은 요청으로 재확인하는 동작을 제공한다.

서버는 기존 정수 범위 `-1000..1000`, 변경 사유, `If-Match` revision, 요청별 멱등성 키, 변경 감사 기록을 유지한다. 저장과 기존 결과 재응답 전에 DB transaction에서 현재 계정 권한·승인 상태·authVersion과 세션 목적·역할·만료·폐기 여부를 재확인한다. 이 보정은 새 팀 계산 또는 초안 재평가에 적용하며 MMR 조정 원장을 생성하지 않는다.

## 로컬 검증

| 검사 | 실행 명령 또는 범위 | 결과 |
| --- | --- | --- |
| 보정 도메인과 HTTP | `npx tsx --test tests/team-balance-override.test.ts tests/team-balance-override-http.test.ts` | 4/4 통과 |
| 격리 DB 계약 | `V2_DB_CONTRACT_SCOPE=team-tools npm run test:db` | PostgreSQL 18, 3/3 통과; 일회성 클러스터 종료·삭제 확인 |
| 전체 계약 테스트 | `npm run test:contracts` | 672/672 통과 |
| 변경 범위 lint | API, repository, 관련 테스트 및 UI의 scoped ESLint | 통과 |
| 타입 검사 | `npm run typecheck` | 통과 |
| diff 검사 | `git diff --check` | 통과 |
| 실제 브라우저 | `node --import tsx scripts/test-db/verify-team-balance-admin-browser.ts` | 합성 ADMIN 로그인, +25 저장·DB 확인·새로고침, 동시 수정 412, 재조회 중 연결 실패 후 입력 보존, 저장 재시도, 0점 해제 통과 |
| 반응형 | 실제 Chromium 1440 / 390 / 320px | 화면과 조작부 가로 넘침 없음, 스크린샷 시각 확인 |
| 프로덕션 빌드 | `npm run build` | 컴파일·타입·102개 정적 페이지 생성 통과 |
| 2026-10-09 배포 전 전체 검사 | `npm run check` | exit 0; 계약 672 통과, 단위 1069 통과 / 1 skip, lint 오류 없음, 타입·ERD·이미지 68개·빌드 통과 |
| 2026-10-09 배포 전 비밀정보 검사 | `node scripts/check-secrets.mjs --tree-only` | 통과 |

HTTP 검증은 ADMIN/SUPER_ADMIN 허용, USER/ACCOUNT 세션 거부, 승인 정지·비밀번호 변경 요구·미로그인 거부와 저장 응답의 ETag/no-store를 확인했다. DB 검증은 ADMIN 저장의 revision 증가와 감사 기록, 재시도 중복 방지, USER/ACCOUNT 거부, 권한·상태·authVersion 변경 및 만료·폐기 세션의 재응답 거부, 기존 MMR 원장 불변을 확인했다.

브라우저 재현은 격리 PostgreSQL에 합성 관리자와 플레이어만 생성한다. 실제 운영 계정·선수·점수는 변경하지 않았다. 결과와 이미지: [검증 결과](browser-result.json), [PC](desktop.png), [390px](mobile.png), [320px](narrow.png). 첫 자동화 시도에서 headless 브라우저 포커스를 얻지 못했으며, 대상 페이지 포커스와 hydration 이후 입력을 확인한 최종 실행이 통과했다.

Windows DB 재현 명령:

```powershell
$env:PG_BIN_DIR = 'C:/Program Files/PostgreSQL/18/bin'
$env:V2_DB_CONTRACT_SCOPE = 'team-tools'
npm run test:db
```

## 남은 확인

운영 배포 ID·URL·health/smoke 근거가 없으므로 이 문서는 운영 반영을 증명하지 않는다. commit과 tag가 아직 없어 릴리스 registry에는 등록하지 않았다.
