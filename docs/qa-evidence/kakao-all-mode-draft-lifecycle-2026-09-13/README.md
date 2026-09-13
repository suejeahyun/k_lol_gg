# 카카오 파티·내전·스크림 통합 수명주기 v1.0.0

## 판정

- 기능 ID: `kakao-all-mode-draft-lifecycle`
- 기능 버전: `1.0.0`
- 기능 커밋: `249a1bf24e27dac0f5c59103bc6d5b3ea0c80743`
- 운영 DB head: `0039_massive_arachne`
- 사이트·서버: Vercel Production 배포 및 운영 별칭 확인
- 휴대폰 MessengerBot R 설치: 사용자 설치 대기
- 실제 Kakao 방 송수신: 사용자 설치 후 확인 필요

따라서 판정은 **사이트·서버·운영 DB 반영 완료, 휴대폰 봇 설치 및 실제 방 E2E 대기**다. 휴대폰 실기기 완료로 판정하지 않는다.

## 적용 범위

파티, 내전, 스크림에 같은 공개 수명주기를 적용했다.

1. 생성 명령은 실제 번호가 예약된 작성 양식만 반환한다.
2. 미작성 양식은 `DRAFT`이며 현황과 공개 API에서 보이지 않는다.
3. 작성한 전체 양식을 보내면 같은 번호가 활성화된다.
4. 활성화 뒤 `상세 번호 추가/삭제 이름`, `내전상세 번호 추가/삭제 이름`, `스크림상세 번호 추가/삭제 이름`으로 명단을 변경한다.
5. 변경 결과 아래에 최신 현황을 이어서 표시한다.
6. `/` 유무, 전각 문자, `#`, 공백, 제한된 오타를 허용한다.
7. 매일 06:00 KST에 이전 운영일의 카카오 소유 활성 항목과 초안을 종료한다.

파티 양식은 `운영일`, `시작시간`, `게임정보`, `주최자`를 포함한다. 시작시간과 게임정보를 비우면 활성화 시각과 `미입력`을 사용한다. 운영일을 양식에 고정해 06:00 경계 뒤 오래된 양식이 새 운영일 항목을 잘못 수정하지 않도록 했다.

내전은 기존 사이트 신청자와 확정 참가자를 보존하면서 카카오 참가자와 확인 필요 참가자만 합성한다. 정원 계산은 사이트, 카카오, 확인 필요 참가자를 모두 포함하고 초과 시 전체 transaction을 rollback한다. 스크림은 기존 라인업을 단일 원천으로 사용하며 빠른 명령을 revision-safe·멱등 처리한다.

## 로컬 검증

- 최종 `npm run check`: 종료 코드 0
- 계약 테스트: 390/390 PASS
- 일반 테스트: 771 PASS, 격리 DB 전용 1 intentional skip, 실패 0
- Next.js production build: static generation 93/93 PASS
- Drizzle 검증: 102 tables / 165 foreign keys, schema hash `13e835c456bf0c679b38fe0b397be198afc53c8e3b832432806c15e8d5f579bc`
- 여성 홈 가이드: 챔피언·이미지 68/68, 1672x940, 중복 hash 0
- PostgreSQL 18 recruiting 계약: 49/49 PASS
- PostgreSQL 18 operations 계약: 1/1 PASS
- 현재 Git tree 비밀값 검사: PASS
- `git diff --check`: PASS

중점 DB 계약은 사이트·확정 내전 참가자 보존, 정원 초과 rollback, 동시 스크림 명령 직렬 합성, 반복 전체 양식 row-level no-op, 06:00 이전 운영일 종료 범위를 검증했다. 임시 PostgreSQL cluster와 경로는 테스트 종료 뒤 제거했다.

## 운영 DB 반영

- 적용 migration: `drizzle/0039_massive_arachne.sql`
- migration SHA-256: `dc1d06a6b835ae7bca24b868ac075df59e4a909b8f5733889fea480efbd18774`
- 적용 전 migration 수: 39
- 적용 후 migration 수: 40
- 신규 enum: `competition.season_inhouse_round_status`
- 신규 column 확인: 5개
- 신규/교체 constraint 확인: 5개
- 기존 내전 status null: 0건
- migration journal 중복: 0건, 해당 row 1건

운영 Neon production에 migration을 하나의 transaction으로 적용한 뒤 journal, enum, column, constraint와 null 상태를 다시 조회했다. 기존 운영 데이터를 삭제하지 않았다.

## 운영 배포

- Vercel deployment ID: `dpl_FaX8XujaQQrBY9ntwixwQTgQooAZ`
- 불변 주소: `https://k-lol-qws4czbus-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- Vercel 상태: `Ready`
- 생성 시각: `2026-09-13 20:25:48 KST`
- 확인 시각: `2026-09-13T11:28:01.952Z`
- `/api/health`: HTTP 200, `status=ready`
- `/api/recruits`: HTTP 200, 공개 파티 10건 모두 `IN_PROGRESS`, 공개 초안 0건, `organizerText` 10/10
- `/help/recruits`: HTTP 200
- 배포 Cron: `/api/cron/kakao-daily-close`, `0 21 * * *` = 06:00 KST

## 휴대폰 한 번 붙여넣기 파일

- 파일: `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R11_2026_09_13_ALL_MODE_DRAFT`
- SHA-256: `B2E7E214F949F766B48EB8FE530A8B27F2459DEBFC5C61CD03F79977E1E67DB7`
- 크기: 70,607 bytes
- Rhino ES5 정적 경고 후보: 0

이 파일은 사이트 배포만으로 휴대폰에 자동 설치되지 않는다. MessengerBot R의 기존 전체 코드를 파일 전체로 교체하고 저장·컴파일·재실행한 뒤 `봇버전`을 확인해야 한다.

## 남은 위험과 운영 확인

- 휴대폰 설치 뒤 실제 한 기기·두 Kakao 방에서 파티/내전/스크림 생성→전체 양식 활성화→추가→삭제→현황을 각각 확인해야 한다.
- 다음 06:00 KST Cron의 실제 실행 결과와 종료 건수는 배포 설정만 확인했으며 실행 로그는 아직 없다.
- 운영 스크림이 현재 0건이어서 공개 API의 스크림 초안 비노출은 로컬·DB 계약으로 검증했고 운영 실데이터 응답 비교는 아직 없다.
- 서명 비밀값은 코드·근거 문서·응답에 기록하지 않았다.

## 롤백

문제가 있으면 Vercel을 직전 확인 배포로 되돌리고 휴대폰 봇을 직전 설치본으로 복원한다. `0039`는 이전 서버와 호환되는 nullable/default 기반 추가 migration이므로 긴급 롤백 시 운영 데이터를 삭제하거나 migration을 역적용하지 않는다.

## 다음 권장 패치

1. 휴대폰 설치 hash와 `봇버전`을 자동 대조하는 설치 체크리스트 응답을 추가한다.
2. 06:00 Cron의 종료 건수·실패 사유를 개인정보 없이 운영 대시보드에 남긴다.
3. 같은 이름이 여러 번 등장할 때 슬롯 번호로 안전하게 지정하는 보조 명령을 설계한다.
4. 카카오 요청의 p50/p95 응답 시간과 mutation 후 현황 조회 실패율을 수집한다.
5. 스크림 실제 운영 샘플로 생성·활성화·라인업 추가/삭제·종료 회귀를 기록한다.
