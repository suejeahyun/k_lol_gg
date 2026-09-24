# 랭킹 갱신 1.0.0

기존 MMR 서비스의 `catchUp()`이 운영 예약에서 호출되지 않아 공개 경기 변경을 반영하지 못했다. 독립 보호 GET cron과 5분 예약을 추가했다. 전체 원장 재계산·transaction·독립 소비 영수증을 재사용하며 기존 공식의 ADMIN 전환 보호를 유지한다. timeout·동시 실행·실패 응답을 검증했다.

일반 랭킹의 기본 내전 참여 10회 기준은 유지하고 제한 없는 보기와 집계 시각을 제공한다. 개인 기록과 MMR에도 집계 시각을 표시한다. 스키마·migration·휴대폰 코드 변경 없음.

## 운영 읽기 전용 조사

- 2026-09-25 06:22~06:25 KST 기준 공개 경기 47회·104게임, 시즌 통계 READY generation 6의 원본 수와 일치. 경기 변경 outbox 대기·실패 없음.
- 결과가 있는 93명 전원의 게임·승리·참여·MVP 집계 불일치 0건.
- 최근 참가자 29명 전원에 대해 공개 개인 통계 API HTTP 200, 원본 게임·승리·참여 수 일치와 최근 기록 존재 확인.
- 최근 참가자 중 20명은 기본 내전 참여 10회 기준 미달. 동명이인 등록이 있으므로 이름만으로 계정을 합치지 않았다. 사용자가 지칭한 개인의 이름/링크는 확인 대기다.
- MMR은 READY generation 1, 기존 공식 `V1_INTERNAL_MMR_1`, 42회·91게임·81명. 마지막 집계 2026-09-08 00:36 KST, MMR 소비 영수증 0건.
- 현재 코드 공식 `V2_DETERMINISTIC_1`의 순수 계산 미리보기는 47회·104게임·93명. 기존 65명의 점수가 -10.17~+7.39점 변하고 12명이 추가되며 삭제 0명. 실제 DB 쓰기는 실행하지 않았다.
- 기존 점수 전환은 명시적 최고 관리자 재계산 승인을 기다린다. 기존 production 관리자 세션이 없어 관리자 로그인도 필요하다. 승인 전 cron은 409 `MMR_FORMULA_TRANSITION_REQUIRED`를 반환한다.

원본 회원·경기 데이터와 개인별 비교 결과는 비공개 로컬 진단 파일에만 저장했다. 이 문서에는 합계와 고정 상태만 기록한다.

## 검증

- `npm run check` PASS: 계약 435, 단위 958, DB 의존 1 skip. lint 오류 0·기존 경고 57, typecheck·ERD·가이드 이미지·프로덕션 빌드 PASS.
- MMR 관련 단위 13/13 PASS, `V2_DB_CONTRACT_SCOPE=mmr npm run test:db` 격리 PostgreSQL 18 계약 1/1 PASS 및 정리 완료.
- HTTP handler 인증 전 DB 접근 차단, 성공 응답 allowlist, 기존 공식 409, 실패 원문 비노출 확인.
- 실제 DB를 연결한 handler로 초기 반영/재전송, 동시 1회 반영, 잠금 시간 초과 503, 기존 공식 차단 시 데이터 보존, 명시적 최고 관리자 전환 후 IDLE 확인.
- 비밀정보 검사와 `git diff --check` PASS.

## 배포

소스 `39677494087e044a03fa8f3af86e73770a7e3993`, Vercel `dpl_3zvcSXir3SpHRVrMYWX1WhiB2SYB` READY와 운영 alias SHA 일치. 2026-09-25 06:33 KST health ready, 새 cron 비인증 401, 일반 랭킹 93명·47회·104게임 확인. [배포·smoke·CI](./deployment.json), [검증](./validation.json).

실제 브라우저에서 전체 참가자 링크 이동, 일반/MMR/개인 기록 집계 시각 표시를 확인했다. 360px 화면에서 가로 overflow 없음. MMR은 기존 공식·42회·91게임 상태이며 관리자의 명시적 전환 확인을 기다린다. GitHub main CI 36062024531 SUCCESS. 태그 `ranking-refresh-v1.0.0`은 위 소스를 가리킨다.
