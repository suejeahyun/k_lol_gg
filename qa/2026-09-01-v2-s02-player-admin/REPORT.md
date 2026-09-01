# V2 S02 플레이어 등록부 QA 보고서

- 작업 브랜치: `feature/v2-player-admin-s02`
- 최초 기준: `a6118dbe8ef3892b5725533b85a6cd6f6146e02c`
- 보안 후속 rebase 기준: `7412472`
- 검증일: 2026-09-01 (Asia/Seoul)
- 운영 반영: 없음
- 외부 API·실계정·운영 DB 접근: 없음

## 범위

- nullable unique positive `legacyId` forward migration과 기존 행 보존
- 공개 숫자 ID → active UUID mapping 308 / mapping 없음 404
- ADMIN/SUPER 전용 목록·검색·상세·등록·수정·soft-deactivation·명시적 재활성화
- strict JSON/query, allowlist DTO, same-origin, idempotency, strong If-Match/revision
- 변경 + audit + idempotency receipt 원자 transaction, 24시간 만료와 mutation 시 만료행 정리
- 회원명·계정 정보의 관리자 경계 고정

## 자동 검증

| 명령 | 결과 |
|---|---|
| `npm run check` | lint, TypeScript, JS 계약 6/6, TS 단위 75/75, Next build·static generation 20/20 통과 |
| `npm run test:db` | PostgreSQL 18 DB 계약 15/15(8+6+1), durable auth·TOTP·player HTTP 3종 통과 |
| `npm run verify:auth-http` | 기존 관리자 인증·권한·쿠키·로그아웃 회귀 통과 |
| `npm audit --omit=dev` | 런타임 취약점 0건 |
| `npm run security:secrets` | tracked tree와 전체 Git history 통과 |
| `npm audit` | 개발 전용 경로 moderate 4건 확인, breaking 강제 수정 미적용 |

전체 `npm audit`에는 개발 전용 `drizzle-kit → @esbuild-kit → esbuild` 경로의 moderate 4건이
남는다. 제안된 `--force` 수정은 `drizzle-kit@0.18.1`로 큰 하위 버전 변경을 일으켜 적용하지 않았다.

## PostgreSQL·HTTP 계약 결과

- migration 0000/0001 상태의 기존 플레이어를 만든 뒤 S02 migration 적용: UUID와 기존 필드 보존,
  `legacy_id NULL`, 재실행 안전성 확인
- `legacy_id` 양수·unique와 nickname/tag normalized unique 확인
- 공개 회원명 검색 결과 0건, 관리자 회원명 검색 결과 1건 확인
- active legacy mapping 308, 없음·비활성·잘못된 숫자 404 확인
- ADMIN과 SUPER_ADMIN 로그인 후 목록·상세 접근, USER 403, 익명 401 확인
- create 201/ETag, 동일 요청 replay, duplicate 409, missing If-Match 428,
  update 200, stale 412/current ETag, deactivate·reactivate 200/replay 확인
- 재활성화 stale 412/current ETag, USER 403, cross-origin 403과 공개 legacy/search 복귀 확인
- create/update/deactivate/reactivate audit 4건 확인
- 존재하지 않는 audit actor로 append 실패 시 player insert와 reactivation 모두 rollback 확인
- idempotency receipt와 JSON 직렬화 결과에 원문 키가 없음을 확인
- 다른 key의 만료 receipt는 다음 mutation에서 정리되고 미만료 receipt는 보존됨을 확인

## 브라우저 QA

합성 ADMIN, 합성 TOTP, 일회성 PostgreSQL 18만 사용했다. S01 보안 후속 rebase 뒤에도 fixture
우회 없이 durable DB 계정의 비밀번호와 TOTP로 실제 로그인해 재활성화 화면을 다시 확인했다.
데스크톱 1440×1000과 모바일 390×844에서 검수했다.

| 상태 | 데스크톱 | 모바일 |
|---|---|---|
| 목록 ready | [desktop-player-list.png](desktop-player-list.png) | [mobile-player-list.png](mobile-player-list.png) |
| 신규 등록 | [desktop-player-new.png](desktop-player-new.png) | [mobile-player-new.png](mobile-player-new.png) |
| 상세 | [desktop-player-detail.png](desktop-player-detail.png) | [mobile-player-detail.png](mobile-player-detail.png) |
| 재활성화 확인 | [desktop-player-reactivate.png](desktop-player-reactivate.png) | [mobile-player-reactivate.png](mobile-player-reactivate.png) |
| 수정 | [desktop-player-edit.png](desktop-player-edit.png) | query 통합 진입 확인 |
| 밸런스 진입 | [desktop-player-balance.png](desktop-player-balance.png) | S05 대기 문구 확인 |
| Riot 진입 | [desktop-player-riot.png](desktop-player-riot.png) | S12 대기 문구 확인 |
| 빈 검색 | [desktop-player-empty.png](desktop-player-empty.png) | 동일 responsive component |
| 저장소 오류 | [desktop-player-error.png](desktop-player-error.png) | 상세정보 비노출 확인 |
| 404 | [desktop-player-not-found.png](desktop-player-not-found.png) | UUID 안내 확인 |
| 409 중복 | [desktop-player-conflict.png](desktop-player-conflict.png) | inline live message 확인 |

확인 결과:

- page-level horizontal overflow 0
- 모바일 등록부는 가로 스크롤 표를 카드형 semantic table로 개선
- 플레이어 상세 링크의 실제 터치 높이 44px
- 재활성화 확인·취소 버튼의 실제 터치 높이 44px
- 재활성화 확인 화면의 데스크톱·모바일 document horizontal overflow 0
- 목록·등록·상세에서 브라우저 console warning/error 0
- 재활성화 확인 follow-up에서도 브라우저 console warning/error 0
- loading, ready, empty, error, 403(HTTP), 404, 409, 412 상태 계약 확인
- 회원명은 관리자 페이지에만 보이고 공개 회원명 query로 플레이어가 노출되지 않음

캡처는 개발 서버에서 생성했으므로 Next 개발 도구 버튼이 보일 수 있다. production 캡처나 운영 반영
증거로 사용하지 않는다.

## 작업 중 발견 후 수정

1. reverse proxy 내부 host가 공개 host와 다를 때 redirect host가 바뀔 수 있어 legacy `Location`을
   상대 경로로 고정했다.
2. Server Component streaming에서 200 meta redirect가 될 수 있던 edit/balance/Riot 호환 page를
   실제 308 Route Handler로 변경했다.
3. 모바일 등록부의 내부 가로 스크롤을 읽기 쉬운 2열 카드로 변경했다.
4. Next error boundary가 전달하는 `reset` 대신 존재하지 않는 `retry`를 받던 오류를 수정했다.
5. V1 편집의 비활성 플레이어 복구 동등성을 편집 DTO의 암묵 상태 변경이 아닌 전용 재활성화
   endpoint와 확인 UI로 분리했다.
6. 24시간이 지난 멱등성 영수증이 같은 key 재사용 전까지 남던 문제를 모든 player mutation의
   expiry-index 기반 opportunistic cleanup으로 제한했다.

## 정확한 미완료·위험

- S05 밸런스/라인별 MMR/통계 재계산은 진입점만 있고 실제 값은 표시하지 않는다.
- S12 Riot RSO/연결/동기화/재시도는 진입점만 있고 외부 API를 호출하지 않는다.
- production V1 숫자 ID backfill, 운영 count/hash/invariant 검증과 복구 리허설은 하지 않았다.
- S13 무활동 환경의 만료 영수증 주기 정리 scheduler와 보존량 모니터링은 아직 없다.
- 전체 개발 의존성 audit의 moderate 4건은 호환성 있는 상위 의존성 해결을 기다린다.

따라서 이 보고서는 S02 플레이어 기반 CRUD의 로컬 후보 증거이며, V2 전체 완성·운영 준비·배포
완료를 뜻하지 않는다.
