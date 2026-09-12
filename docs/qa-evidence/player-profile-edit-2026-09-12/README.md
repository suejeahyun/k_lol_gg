# 플레이어 Riot ID·티어 편집 v1.0.1

## 판정

- 기능 ID: `player-profile-edit`
- 기능 버전: `1.0.1`
- 코드 커밋: `5b089b16da9c5902f58d789038eee125ad5d4530`
- Git tag: `player-profile-edit-v1.0.1`
- Vercel 배포: `dpl_2jDYnFXxGGz2FpjgccBdV3z8sV4B`, `Ready`
- 불변 URL: `https://k-lol-8zheg3pua-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 운영 health: `2026-09-12T12:03:16.3288394Z`에 HTTP 200, JSON `status: ready`
- DB migration: 없음, head `0037_swift_brood` 유지
- 운영 데이터 변경: 없음

본인과 관리자의 Riot ID·현재 티어·최고 티어 편집, Riot 연동 안전 경계, 실제 PostgreSQL 18 및 실제 Next HTTP 흐름을 확인했다. 운영 사용자의 프로필을 시험 변경하는 작업은 하지 않았다.

## 변경 내용

- 승인된 활성 사용자는 `/account?tab=player`에서 Riot ID, 현재 티어, 최고 티어를 수정할 수 있다.
- ADMIN과 SUPER_ADMIN은 `/admin/players/:playerId?mode=edit`에서 같은 항목을 수정할 수 있다.
- 티어만 바꾸면 기존 Riot 연결, 보호 PUUID, 대기·재시도·실행 중 동기화 작업을 유지한다.
- Riot ID를 바꾸면 같은 DB transaction에서 이전 연결을 `DISCONNECTED`로 전환하고 보호 PUUID를 제거하며 진행 중 작업을 취소한다.
- 연결 해제와 작업 취소는 개인정보·비밀값을 남기지 않는 감사 이벤트로 기록한다.
- Riot ID 중복 등 플레이어 저장이 실패하면 연결 해제, 작업 취소와 감사 이벤트도 전부 rollback한다.
- 직접 연결과 RSO 재연결은 현재 플레이어 등록부 Riot ID와 정확히 일치하는 ID만 허용한다.
- 본인 편집의 stale revision(412)은 최신 정보를 다시 불러오도록 복구한다.
- stale 응답 뒤 revision이 바뀌면 본인 폼을 재마운트해 화면 입력도 최신 서버값으로 되돌린다.
- 가입·본인 편집·관리자 편집·Riot 연결이 공통 Riot ID 정규화와 실제 16자/5자 제한을 사용한다.
- 관리자 Riot 화면은 연결 해제 상태에서 이전 ID를 현재 ID처럼 표시하거나 동기화를 권하지 않고, 새 등록부 ID로 재연결하도록 안내한다.

## 실 테스트 근거

### 전체 정적·단위·빌드

- `npm run check`: 종료 코드 0
- ESLint: 오류 0, 기존 MessengerBot 생성 파일 경고 31개
- TypeScript: PASS
- ERD drift: 102 tables, 165 foreign keys, schema SHA `7911650458777e61a3cdece988a10f26653c69618c05ca4a9beb78601e1963c4`
- 전체 테스트: 726개 중 725 PASS, DB 전용 1개 intentional skip
- 여성 홈 가이드 이미지: 68/68, 중복 SHA 0
- Next production build: 92 static pages 생성 PASS
- `git diff --check`: PASS
- 현재 추적·미추적 트리 비밀값 검사: PASS
- 최종 412 보완 후 집중 테스트 2/2, TypeScript와 변경 파일 lint: PASS
- 독립 읽기 전용 재검수: P0 0건, P1 0건

### 실제 PostgreSQL·Next HTTP

`npm run test:db`를 PostgreSQL 18 임시 클러스터에서 전체 실행했다. 실제 migration을 적용하고 실제 Next 서버를 기동한 뒤 HTTP로 다음 흐름을 검증했으며, 종료 후 임시 클러스터와 작업 경로를 삭제했다.

- 본인 프로필 GET, ETag와 편집 화면 SSR
- 본인 PATCH의 401, 403, 428, 400, 409, 412
- 관리자 편집 화면 SSR과 USER 401, origin 403
- 본인·관리자 티어 전용 변경 시 Riot 연결·PUUID·작업 유지
- 연결된 플레이어의 중복 Riot ID 변경 409 및 연결·PUUID·작업·감사 이벤트 전체 rollback
- Riot ID 변경 저장, 기존 연결 해제, PUUID 제거, 작업 취소, 안전 감사 이벤트
- 공개 플레이어 프로필에 새 등록부 Riot ID 반영
- 멱등 replay 성공과 같은 키의 다른 payload 409
- 직접 연결과 RSO의 이전·임의 Riot ID 재연결 거부
- migration head `0037_swift_brood`, 38 migrations, 복구 보고서의 물리 테이블 103개

### 운영 무변경 smoke

- `GET /api/health`: 200, `status: ready`
- 비로그인 `GET /api/auth/me/player`: 401
- 비로그인 `PATCH /api/auth/me/player`: 401
- 비로그인 `PATCH /api/admin/players/:playerId`: 401

운영 데이터 변경 없이 배포 상태와 인증 경계를 확인했다.

## 사용 방법

1. 일반 사용자는 `내 정보 → Riot ID·티어 변경`에서 Riot ID와 티어를 수정한다.
2. 관리자는 `관리자 → 플레이어 → 대상 선택 → 수정`에서 같은 항목을 수정한다.
3. Riot ID를 바꾼 경우 `Riot 전적 연동` 화면에서 변경한 Riot ID로 다시 연결한다.

## 남은 위험과 롤백

- 실제 운영 Riot 계정으로 RSO/API 재연결하는 외부 E2E는 운영 사용자 동의와 실제 계정이 필요하므로 실행하지 않았다. 등록부 ID 일치 여부와 성공·거부 흐름은 합성 Riot provider와 실제 DB/HTTP로 검증했다.
- 현재 티어가 최고 티어보다 높은 조합을 막는 정책은 티어·디비전·LP 비교 기준이 확정되지 않아 이번 범위에 넣지 않았다.
- 문제가 확인되면 Vercel을 직전 Ready 배포로 되돌린다. migration과 운영 데이터 변경이 없어 DB 롤백은 필요하지 않다.

## 디스코드 복붙 공지

```text
[K-LOL.GG 플레이어 정보 수정 패치]

- 내 정보에서 Riot ID, 현재 티어, 최고 티어를 직접 변경할 수 있습니다.
- 관리자는 플레이어 상세의 수정 화면에서 같은 정보를 변경할 수 있습니다.
- 티어만 변경하면 기존 Riot 전적 연동은 유지됩니다.
- Riot ID를 변경하면 잘못된 전적 연결을 막기 위해 기존 연동이 안전하게 해제됩니다.
- Riot ID 변경 후에는 Riot 전적 연동 메뉴에서 변경한 ID로 다시 연결해 주세요.
```

## 다음 권장 패치

1. 합성 로그인 세션을 사용하는 브라우저 클릭·키보드·axe 회귀를 본인·관리자 편집 화면에 추가한다.
2. 관리자 감사 로그 화면에 Riot ID 변경에 따른 연결 해제 사유와 작업 취소 건수를 개인정보 없이 표시한다.
3. 현재 티어와 최고 티어의 논리 관계를 검증할 공식 비교 정책을 정한다.
4. 프로필 저장 직후 변경한 Riot ID로 재연결하는 안내 흐름을 한 화면으로 묶는다.
