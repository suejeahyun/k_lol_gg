# 파티 고정 모집코드 검증 근거 — 2026-10-14 KST

## 현재 기록 상태

`stable-recruit-codes@1.0.0`의 **소스 구현 및 배포 준비 기록**이다. 사용자 분석 확인 후 “진행해줘” 승인으로 고정 모집코드·별도 명단 버전 방식을 구현했다. 최종 `npm run check`, 격리 recruiting 110/110, kakao-v4 scope 33/33, 운영 전 백업·복원 및 restored-copy migration rehearsal이 통과했다. 운영 migration 0049 적용과 재실행 no-op을 확인했다. 앱 배포·health는 아직 확정하지 않았다. 로그가 존재하는 것만으로 해당 최종 상태를 PASS나 운영 반영으로 판단하지 않는다.

- [설계 결정 ADR 0014](../../architecture/0014-kakao-stable-recruit-codes.md)
- [한국어 패치 노트](../../patch-notes/stable-recruit-codes-v1.0.0.md)
- [데이터 검증 상세](data.md)
- [휴대폰 설치 안내](../../../integrations/messengerbot-r/MESSENGERBOT_R_INSTALL.md)
- 작업 branch: `codex/stable-recruit-codes-20261014`
- migration head: `0049_stable-recruit-codes`
- 릴리스 commit·tag·Vercel 배포 ID·운영 alias 확인: 최종 릴리스 단계에서 기록

## 변경 범위와 검증 기준

| 범위 | 구현·계약 | 최종 확인해야 할 내용 |
| --- | --- | --- |
| 모집 식별 | 인증된 논리 scope+실제 파티 UUID에 고정 code 연결. 다른 파티로 재할당하지 않음 | 최초·동시 발급 수렴, 다른 scope/UUID 차단, 종료 후 재활성화 차단 |
| 복사 원본 | `모집코드`와 `명단버전` 두 줄, 내부 `CODE@version` 원본 참조 | 모든 파티 양식 왕복, 줄 누락·혼합·위조 거부, 원문 한 번 전달 |
| 동시 편집 | 원본·최신·제출값 비교와 대상 잠금 유지 | 참가 보존, 충돌의 원자 거부, 중복 이름·정원·행 누락 검사 |
| 운영일 경계 | code는 유지, 원본은 06:00 KST 만료, 마지막 버전 번호는 보존 | 이전 `code@version` 재사용 방지, 같은 code로 새 원본 제공 |
| 코드 명령 | 상세·추가·삭제·쫑을 code로 지정해 실제 UUID 해석 | 같은 번호의 새 모집을 잘못 조회·수정·마감하지 않음 |
| 숫자 명령 | 기존 현재 운영일+번호 대상 해석 | 숫자 상세·추가·삭제·마감 회귀 |
| 호환 | 구 `양식코드`는 기존 테이블과 만료 규칙 사용. INHOUSE 불변 | 기존 원본·구 writer·내전 흐름 회귀 |
| DB | registry·원본 두 테이블만 추가 | fresh/0048→0049 upgrade/replay, 제약·동시성·rollback·구 writer 호환 |
| 휴대폰 | R28 코드 명령 사전 전달, 기존 양식 전체 복사 경계 유지 | ES5/Rhino·문자 제한·서명 요청 1회·echo·멱등성 회귀. 실제 설치는 별도 |

고정 코드가 모집의 영구 활성 상태를 뜻하지 않는다. 기존 비활동 자동 마감과 이전 운영일 DRAFT 정리를 유지한다. 명단 원본의 물리 정리는 요청당 최대 256개이며, 새 정기 삭제 작업을 설치했다고 주장하지 않는다.

기존 모집은 새 상세 조회 또는 다음 저장에서 고정 코드를 처음 얻는다. 기존 legacy 양식코드는 해당 운영일 유효기간 안에서 계속 처리하며 운영 snapshot backfill이나 code 재할당은 하지 않는다.

## 집중 검사 관측

아래는 담당자가 해당 명령을 실행해 관측한 집중 결과다. 후속 소스 변경을 모두 포함한 최종 통합 실행으로 대체하거나 재확인해야 하며, 서로 겹치는 수를 합산하지 않는다.

| 실행 | 관측한 결과 |
| --- | --- |
| `node --import tsx --test tests/kakao-stable-recruit-code-commands.test.ts tests/kakao-v4-command-classifier.test.ts` | 19/19 PASS. 고정 코드 alias·slash·소문자·전각문자·06시 경계·profile·잘못된 코드·여러 이름 차단 및 기존 명령 계약 |
| `node --test tests/kakao-v1-strict-messengerbot.test.mjs` | 41/41 PASS. 새 두 줄 복사, code 명령의 원문 단일 전달, echo·기존 서명·멱등성·V1 원본 실행문 보존 포함 |
| `node --test tests/kakao-v1-exact-v4-adapter-architecture.test.mjs` | 6/6 PASS. private installer marker·현재 공개 버전·서명·installation 경계 포함 |
| classifier/canonical/새 code 명령 테스트/build script focused ESLint | 종료 코드 0 |
| `git diff --check` | 오류 없음. Windows checkout의 journal 줄바꿈 경고는 별도 |

파티 양식의 두 줄·구형 코드 호환 검사는 `tests/kakao-party-stable-code.test.ts`, 실제 DB 저장·종료·날짜 경계는 `tests/database/recruiting.contract.test.ts`, 코드 registry·원본·migration은 `tests/database/kakao-recruit-form-snapshots.contract.test.ts`를 사용한다. 각 최종 실행 결과는 [데이터 검증 상세](data.md)와 아래 최종 검사 기록에서 확인한다.

## 최종 검증·배포 기록란

| 단계 | 이 초안의 판정 |
| --- | --- |
| `npm run check` | 최종 PASS, 종료 코드 0. 계약 691/691, 단위 1,101 pass/1 skip/0 fail, ERD 114 table/175 FK, lint 0 error/58 warning, production build PASS. [최종 로그](check-release.log). 최초 도움말 기대 문구 계약 2개·단위 1개 실패 후 기대값을 정리했으며 중간 [실행 로그](check-final.log)는 최종 PASS 근거로 사용하지 않음 |
| 격리 recruiting/kakao-v4 DB 및 migration 계약 | 담당 최종 보고: recruiting 110/110, kakao-v4 scope 33/33 PASS. HTTP 서버 end-to-end 검증을 뜻하지 않음. [데이터 상세](data.md), [계약 집계](data-contracts.json), [계약 로그](data-contracts.log) |
| 운영 전 백업·복원 및 restored-copy rehearsal | PASS. 기존 193개 테이블 보존·별도 복원, 복원본에서 0049 적용·replay PASS. [백업 기록](production-backup-restore.json), [rehearsal 기록](migration-rehearsal.json). 운영 적용 직전 SQL hash·대상·시각 재확인 필요 |
| 운영 migration 적용·재실행 | PASS. 2026-10-13 16:16:58 UTC, migration 50개/head 0049. 기존 파티 1,660·legacy 원본 12·receipt 2,597개 보존, 새 두 테이블 0개로 시작, invalid constraint 0, 재실행 no-op. [기록](production-migration.json) |
| production 후보·운영 배포·health/smoke | 미기재 |
| 릴리스 tag·registry·비밀정보 검사 | 미기재 |
| R28 비공개 설치본 생성 | 기존 비공개 설정을 재사용해 root 담당자가 생성 성공. 아래 메타데이터만 기록하며 본문·비밀값은 보관하지 않음 |
| 실제 휴대폰 R28 교체·송수신 | 미확인. 기존 실기기 확인 이력을 이번 버전 설치 증거로 사용하지 않음 |

## 휴대폰 공개 생성 근거

공개 생성본 `KLOL_KAKAO_BOT_V40_R28_2026_10_14`는 LF 63,560자, CRLF 65,449자, 물리 줄 1,890개로 빌드했다. LF SHA-256은 `73d7e3ed4f09c57cb54d84df67c272530d69c986b5199666f19cf37d5a4c9843`이다. 공개 생성본은 비밀값이 없는 검토 기준이며 휴대폰용 비공개 설치본과 구별한다.

root 담당자가 기존 비공개 설정으로 `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js`를 생성했다. R28, LF 61,849자, CRLF 63,739자, SHA-256 `2a7874198cdfb97116a5572afdbdc77a4129654617730752fa120f4f9ee98b37`이다. 이 기록은 생성 성공이며 실기기 설치 상태는 `PENDING_USER_INSTALL`이다.

추가된 코드 명령과 도움말 때문에 기존 빌드가 CRLF 65,535자 제한을 넘는 것을 확인했다. 제한을 유지하면서 유지보수하는 adapter/transport의 토큰 사이 수평 공백만 줄였다. 문자열·정규식·줄바꿈을 보존했고 기존 V1 원본 함수 동일성, ES5 parser, Rhino 정적 검사와 전체 휴대폰 runtime 회귀가 통과했다. 이후 재생성본의 메타데이터가 바뀌면 이 표와 설치 안내를 함께 갱신한다.

## 복구 기준

0049는 두 테이블을 추가하며 기존 legacy 원본을 변경하지 않는다. 앱 rollback 시 추가 테이블과 고정 코드의 마지막 버전 번호를 보존한다. 이전 앱이 새 두 줄 양식을 이해하지 못하면 당시 서버에서 최신 상세 양식을 다시 받는다. down migration으로 registry를 삭제하거나 코드·버전을 다시 발급해 복구하지 않는다.

운영 DB 복원은 이후 쓰기 손실 여부를 별도로 판단해야 하며 앱 rollback과 동일시하지 않는다. 운영 참가자 데이터·서명 키·연결 문자열·비공개 설치본 본문을 이 디렉터리에 저장하지 않는다.
