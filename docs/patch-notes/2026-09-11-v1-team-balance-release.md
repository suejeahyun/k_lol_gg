# V1 팀 밸런스 추천·결과 복사 운영 릴리스

## 적용 상태

- 최종 기능 commit: `8ee4fa4455cf98f0ada62f6ad31d8d45dacc23c4`
- 릴리스 tag: `v2-v1-team-balance-v1.0.1`
- migration: 37개, head `0036_flowery_hairball`
- 운영 deployment ID: `dpl_4BzqPTPUWTVmzmXui1sSVcrzreKC`
- 불변 URL: `https://k-lol-btwyt99iy-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 DB migration: 37개 적용 및 사후 무결성 검증 확인
- 운영 health: `ready`
- 운영 공개 브라우저 QA: 30/30, issues 0
- 운영 앱 반영: **확인됨**

최종 기능 commit과 tag, 지정 Vercel deployment, 운영 별칭 health와 공개 브라우저 30조건을 확인했다. 이 근거 범위에서 V1 팀 밸런스·결과 복사 운영 반영을 확인했다. 로그인·관리자 전체 화면과 외부 서비스 E2E까지 검증됐다는 의미는 아니다.

## 변경 내용

### V1 기준 단일 추천

- 10명의 5:5 분할 126개를 비교한다.
- 각 팀에서 TOP/JGL/MID/ADC/SUP 120개 배치를 비교한다.
- 사용자가 고르지 않은 포지션은 AUTO로 처리한다.
- 세 후보를 나열하던 화면을 V1 우선순위 전체탐색 최고안 한 개로 정리했다.
- V1 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없어 명시적 0/미제공 경로로 계산하며, 화면에서 제한을 안내한다.

### 결과 공유

- `팀 결과 복사` 버튼으로 BLUE·RED 배치와 밸런스 판단을 3줄 텍스트로 복사한다.
- 공유 문자열에는 닉네임 스냅샷만 사용하고 줄바꿈을 제거한다.
- 계정 ID, player ID, draft ID, URL, 공개 토큰과 비공개 회원명은 포함하지 않는다.
- 복사 성공과 실패 안내를 구분한다.

## 사용자·운영 영향

- 사용자는 여러 추천 후보를 다시 비교하지 않고 기본 추천 한 개를 바로 확인할 수 있다.
- 디스코드나 카카오톡에 결과를 붙여넣을 때 내부 식별자나 공유 링크가 노출되지 않는다.
- V1 상세 데이터 일부가 없는 상태이므로, 해당 데이터까지 포함된 V1 운영 결과와 점수가 다를 수 있다.
- 단일 추천만 제공하므로 다른 조합을 원하는 사용자는 수동 교체 기능을 사용해야 한다.

## 검증 근거

- `npm run check`: contracts 347/347, unit 707 pass·1 intentional skip, build 92 app routes
- `npm run test:db`: migration 37개, head `0036_flowery_hairball`, Kakao V4 P0 31/31, recovery archive 검증 통과
- `verify:auth-http`: 통과
- tree-only secret scan: 통과
- Data Dragon: 챔피언 173종, 자산 346개
- 여성 홈 가이드: 68/68
- 운영 브라우저 자동 품질: 운영 별칭의 공개 30개 조건 30/30, issues 0, axe 위반 0
- 전체 높이 캡처: 30개 중 27개 PASS, 로컬 DB가 필요한 `/competitions` 3개 조건 BLOCKED
- `/signup` 대비와 `/rankings` CLS: 수정 후 공개 30개 조건 재검증에서 통과, 전체 최대 CLS 0.0021
- 103개 페이지: 합성 fixture 335개 캡처 계획 생성, 인증·관리자 전체 실행은 미확인

## 운영 DB 적용 근거

- 비밀값 비노출 read-only preflight: 기존 migration 35개, head timestamp `1788963649789`
- 적용 전 CONNECTED identity 중복 그룹 0, owner 중복 그룹 0, player-owner mismatch 0
- 자동 만료 1일 복구 분기: `pre-0035-0036-20260911`
- `0035`·`0036`: 단일 transaction 적용
- 적용 후 migration 37개, head hash `ebb200d8597ed63d270c2a66a7369dd67d3536c238939458aeed337028bdc63f`
- Riot unique index 2개, player-owner index 1개, validated foreign key 1개
- 적용 후 CONNECTED identity 중복, owner 중복, player-owner mismatch 모두 0

운영 DB와 앱 배포는 확인했다. 현재 103개 전체 화면의 최신 전수 캡처는 미확인이다.

상세 근거는 [`../qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md`](../qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md)에 정리했다.

## 난이도·우선순위·KPI

| 항목 | 난이도 | 우선순위 | 예상 효과 | 부작용·남은 위험 | KPI |
|---|---:|---:|---|---|---|
| V1 단일 전체탐색 추천 | 중간 | P0 | 추천 선택 부담 감소, V1 흐름 복원 | 대안 비교가 줄고 missing source에 따라 V1 운영 결과와 차이 가능 | 계산 성공률, 수동 교체율, 결과 접수 전 이탈률 |
| 개인정보를 제한한 3줄 결과 복사 | 낮음 | P0 | 외부 채널 공유 편의와 식별자 노출 방지 | 동명이인 구분 정보 감소, 브라우저 권한에 따른 복사 실패 | 복사 성공·실패율, 식별자 노출 사고 0건 |
| migration 기준선 `0036` 정합화 | 낮음 | P0 | 앱 배포 전 DB 무결성 보장 | 복구 분기가 1일 후 자동 만료되므로 보존 시간 내 관찰 필요 | 저장소/운영 head 불일치, preflight 실패율, 무결성 위반 수 |
| 공개 화면 회귀 재검증 | 중간 | P1 | 대비·CLS·가로 넘침 회귀 조기 발견 | 캡처와 검토 시간 증가 | contrast issue, CLS 초과, horizontal overflow 수 |

운영 기준선이 없으므로 KPI 목표값은 제안 상태다. 수치 확정에는 운영자 승인이 필요하다.

## 테스트와 롤백

- 최종 기능 commit에서 `npm run check`, `npm run test:db`, `verify:auth-http`, tree-only secret scan 결과를 대조했다.
- 운영 DB는 `pre-0035-0036-20260911` 복구 분기를 만든 뒤 `0035`·`0036`을 단일 transaction으로 적용했으며 사후 무결성 검증이 통과했다.
- 운영 앱 health `ready`, 운영 DB head `0036`, 공개 화면 30/30을 확인했다.
- 앱 문제가 생기면 직전 확인 deployment로 되돌린다.
- `0035`·`0036` 적용 뒤에는 임의 down migration이나 데이터 삭제를 하지 않는다. DB 복구가 필요하면 검증된 recovery archive와 승인된 운영 복구 절차를 사용한다.

## 확인되지 않은 범위

- 로그인·관리자 화면을 포함한 103개 페이지 335회 실캡처는 실행하지 않았고 계획만 생성했다.
- 실제 휴대폰 Kakao 두 방 E2E는 이번 릴리스에서 다시 확인하지 않았다.
- 실제 사용자 Riot RSO와 Vercel Blob 업로드·읽기·삭제 E2E는 완전히 검증하지 않았다.
- V1 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없으며 명시적 0/미제공 경로를 사용한다.

## 디스코드 복붙용 공지

[`../qa-evidence/v2-v1-team-balance-release-2026-09-11/DISCORD_NOTICE.md`](../qa-evidence/v2-v1-team-balance-release-2026-09-11/DISCORD_NOTICE.md)의 배포 완료 코드 블록을 사용한다.

## 근거 있는 다음 패치 추천

1. P0 · 운영 로그인 세션에서 실제 사용자 데이터가 아닌 승인된 fixture로 팀 계산·결과 복사·경기 결과 연결 smoke를 남긴다.
2. P0 · 1일 복구 분기 만료 전에 DB 오류 지표와 무결성 위반 0건 유지 여부를 확인한다.
3. P1 · 격리 DB·합성 세션으로 `/competitions` 3개 조건과 335개 전체 캡처 계획을 실행한다.
4. P1 · 실제 휴대폰 Kakao 두 방과 승인된 Riot RSO·Blob E2E를 각각 별도 검증한다.
5. P1 · 개인정보 없이 계산 실패율, 수동 교체율, 복사 성공·실패율을 관측하고 목표값은 운영자 승인 후 정한다.
