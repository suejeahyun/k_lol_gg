# 카카오 내전·스크림 번호 마감 R13 QA

검토일: 2026-09-14 KST

대상: V4 서버 마감 명령, MessengerBot R V1 strict R13, PostgreSQL 데이터 경계

판정: 소스·일반 테스트·빌드·격리 PostgreSQL·private gateway 검증 및 Vercel 운영 배포 완료, 휴대폰 설치는 미확인

## 릴리스와 운영 배포

- 기능 커밋: `3bf2aa5fdef1d135c15b6c25646676b86467d256`
- 릴리스 tag: `kakao-r13-scoped-finish-v1.0.0`
- Vercel Production: `Ready`
- 배포 참조: `9d6ZCVgCB6rFRzKxwJaAhkfHmhus`
- 불변 URL: `https://k-lol-m0nwiyr4f-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 운영 확인: `2026-09-14T04:54:28.9176376Z` · `/api/health` HTTP 200 · `status: ready`
- private gateway live 점검: RECRUIT HTTP 200, FEATURES HTTP 200, 자격 증명 출력 없음

## 요구사항과 결과

| 입력 | 프로필 | 범위 | 결과 |
| --- | --- | --- | --- |
| `내전 Nㅉ`, `/내전 Nㅉ` | `FEATURES` | 현재 운영일·동일 installation 방·활성 내전 N | 통과 |
| `스크림 Nㅉ`, `/스크림 Nㅉ` | `RECRUIT` | 현재 운영일·동일 installation 방·활성 스크림 N | 통과 |

- 동일 방의 다른 sender도 관리자 역할 없이 마감할 수 있다.
- 파티의 기존 `Nㅉ`와 충돌하지 않도록 `내전`·`스크림` 접두어를 필수로 한다.
- 서버에는 휴대폰 입력 원문을 그대로 전달한다.
- 마감 후 최신 현황을 반환하며 끝난 번호는 활성 현황에서 제외된다.
- 다른 방·번호·운영일, terminal, DRAFT는 변경하지 않는다.
- 동일 event replay는 최초 저장 결과를 반환하며 mutation·audit·outbox·receipt를 중복 생성하지 않는다.

## DB 보존 경계

- 스크림: `RECRUITING | MATCHED | CONFIRMED → COMPLETED`
- 내전: 현재 스키마의 terminal 값인 `CANCELED`로 활성 round를 닫는다.
- 내전 참가자: 같은 방·회차의 KAKAO `APPLIED`·`RESERVE`와 ACTIVE pending만 취소한다.
- SITE 신청, CONFIRMED 신청, 다른 방, 기존 terminal, 작성 중 DRAFT는 보존한다.

## 생성물

| 파일 | LF 문자 | CRLF 문자 | 물리 줄 | SHA-256 | 상태 |
| --- | ---: | ---: | ---: | --- | --- |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,619 | 65,432 | 1,814 | `30e7599cb6444a34f5d6c9f25bba199fcfc729e7d6024a2a5cdbb7a437f5567f` | 설치 금지 |
| private 전체 복붙 파일 | 61,450 | 63,255 | 1,806 | `348ad262701f834d983dc432c80552b7d556a7c07b71c6c374c75e8bb5a14c6e` | 로컬 ignored, 휴대폰 설치 대기 |

공개 생성본은 MessengerBot R CRLF 제한보다 103자, private 설치본은 2,280자 작다. private 설정값은 생성 과정에서 보존했으며 출력하거나 Git에 추가하지 않았다.

## 검증 근거

```text
npm run check
PASS — 일반 779개 중 778 PASS, DB 전용 1 skip, build static generation 93/93

npm run test:db
PASS — 전체 격리 PostgreSQL 계약, migration 40개, head 0039_massive_arachne
PASS — 내전 마감 보존 경계·후속 현황·durable replay
PASS — 스크림 마감 room 범위·terminal 제외·audit/outbox/receipt/nonce 단일 실행

npx tsx --test tests/kakao-prefixed-finish-contract.test.ts
4 PASS / 0 FAIL

npm run bot:kakao:v1-strict
PASS — LF 63,619 / CRLF 65,432, ES5/Rhino 정적 검사

npm run bot:kakao:v1-strict:private
PASS — LF 61,450 / CRLF 63,255, ES5/Rhino 정적 검사

node scripts/check-secrets.mjs --tree-only
PASS
```

## 운영 반영 상태와 남은 위험

- 서버 기능과 운영 alias는 Production 배포됐다.
- 실제 휴대폰의 기존 소스 백업, R13 private 전체 교체, 컴파일, `/봇버전`, 두 방의 실방 왕복은 사용자 휴대폰에서 확인해야 한다.
- 공개 생성본의 CRLF 여유가 103자뿐이므로 다음 휴대폰 기능 추가 전 압축 여유 확보가 필요하다.
- 내전 DB enum에는 정상 종료 전용 값이 없어 현 terminal 값 `CANCELED`를 사용한다. 사용자 현황에서는 종료된 모집으로 숨기지만, 향후 운영 분석에서 취소와 정상 마감을 분리하려면 별도 migration이 필요하다.

## 다음 패치 추천

1. 휴대폰 R13 설치 후 기능방·구인구직방에서 slash 유무 네 경우를 canary 모집으로 확인한다.
2. 내전 round에 정상 종료 상태를 추가해 운영 통계에서 취소와 마감을 구분한다.
3. 공개 MessengerBot 생성본의 런타임 미사용 부분을 분리해 문자 한도 여유를 늘린다.
4. 마감 명령의 오타 허용 범위는 실방 로그를 근거로만 확장한다.
