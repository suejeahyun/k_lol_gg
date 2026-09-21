# R24 복사·붙여넣기 복귀 재확인 — 2026-09-21

요청: “지금 카카오톡 방식을 기존으로 되돌리고 싶어 양식 복사 붙여넣기”. 추가 확인: **복사·붙여넣기 + 사이트 연동 유지**.

기준 HEAD: `b4d56f58`, 작업 경로 `E:\k-LOL.GG\worktrees\kakao-v4-gateway`. 기존 R23/R24 미커밋 변경을 보존하고 이어서 확인했다. 최초 로컬 검증 뒤 사용자가 “적용해줘”로 운영 적용을 승인했다. 2026-09-21 운영 DB 0040과 서버 R24를 적용하고 검증했다. 휴대폰 설치는 사용자 교체 대기다.

## 운영 릴리스

- 기능: `kakao-r24-site-linked-copy@1.0.0`, tag `kakao-r24-site-linked-copy-v1.0.0`
- 기능 소스: `d405e90e0b271185e07b9c9296308b2c956b9cbb`
- 배포 commit: `5d0e01c274fcb6d42b2cf574443b93fe4d27d8dd` — 로컬 비공개·임시 폴더를 Vercel 업로드에서 명시적으로 제외하는 설정 포함
- Vercel: `dpl_6ZtchrtMHPisXZWNTeoR7HZ6GQCC`, Ready · Production
- immutable URL: `https://k-lol-8qdhu6ixs-tjdmswo11-3715s-projects.vercel.app`
- 운영: `https://k-lol-gg.vercel.app`, 2026-09-21T02:18:07.251Z health HTTP 200 `ready`
- provider의 배포 metadata commit과 release tag 일치 확인: `deployment-source.json`. 운영 alias가 같은 배포 ID를 가리킴: `production-after.json`.
- Git: 기능 브랜치와 release tag를 origin에 push했다. 공유 로컬 main 작업 트리는 건드리지 않았다.
- 휴대폰: `KLOL_KAKAO_BOT_V40_R24_2026_09_20`, `PENDING_USER_INSTALL`

운영 적용 순서: DB logical backup → migration 0040 및 재실행 no-op → Vercel production candidate 빌드 → 인증된 후보 응답 검사 → 운영 alias 승격 → 운영 서명 응답 검사.

## 사용자 동작과 확인 범위

1. 봇이 보낸 최근 파티·내전 양식 전체를 복사한다.
2. 빈 참가/예비 칸에 이름을 추가하고 메시지 전체를 전송한다.
3. 봇의 저장 결과와 최신 명단을 확인한다. 파티는 사이트 모집 데이터, 내전은 사이트 회원·시즌 신청과 연결한다.
4. 기존 참가자·양식코드는 그대로 둔다. 취소는 `상세 9 삭제 내이름` 또는 `내전상세 9 삭제 내이름`을 사용한다.

R24의 참가 흐름은 이미 로컬 소스에 구현되어 있었다. 이번에는 이를 재검증하고 **내전 예비 명단 중간에 생긴 공석이 양식에서 사라지는 문제**를 보완했다. 예비 2~10이 남고 1번이 비었을 때, 11번을 만들지 않고 빈 `예비 1.`을 출력한다. 기존 예비 및 회원 확인 대기 자리는 보존한다.

이전 방식의 이름 삭제·교체까지 그대로 복원하는 변경은 아니다. R24의 추가 전용 저장과 동시 신청 보존 정책을 유지한다. 기존 스크림 종료 변경도 이번 요청으로 새로 도입하거나 되돌리지 않았다.

## 검증 근거

| 확인 | 결과 | 파일 |
| --- | --- | --- |
| 파티·내전 양식, 입력, 동시 신청 병합 | 118/118 PASS | `focused-tests.log` |
| 봇 라우팅·호환성·공개 안내 | 51/51 PASS | `bot-contracts.log` |
| 예비 공석 회귀 테스트 | 수정 전 빈칸 누락 실패 재현, 수정 후 실제 출력 복사·재참가·기존 명단 보존 PASS | `reserve-gap-before.log`, `db-contracts-final.log` |
| 격리 PostgreSQL 모집 계약 | 최초 확인 59/59 PASS, 수정 후 60/60 PASS | `db-contracts.log`, `db-contracts-final.log` |
| 공개·비공개 ES5/Rhino 정적 검사 | PASS, 경고 후보 0 | `rhino-audit.log` |
| 설치 산출물 해시·붙여넣기 제한 | 기존 R24 해시와 일치, 양쪽 모두 65,535자 미만 | `artifact-check.json` |
| 현재 트리 비밀값 검사 | PASS | `secret-scan.log` |
| 수정 후 전체 검사 `npm run check` | exit 0; 계약 410/410, 단위 862 PASS·DB 전용 1 skip, typecheck·ERD·빌드 PASS; lint 오류 0·기존 경고 319 | `npm-check.log` |
| 소스·migration·회귀 검사 해시 | 주요 파일 11개 SHA-256 기록 | `source-hashes.json` |
| diff 공백 검사 | 기본 저장소 설정의 `git diff --check` exit 0; Git 줄바꿈 경고는 보존 | `diff-check.log` |
| 0039→0040 업그레이드·fresh·재실행 | PASS; 기존 102개 테이블 데이터·구조 보존, fresh 103개 테이블 | `migration-upgrade.log` |
| 운영 DB 백업·0040 적용 | PASS; migration journal 40→41, hash 일치, 재실행 no-op, CHECK 7개·인덱스 3개 | `db-backup.json`, `db-migration.json`, `db-production-after.json` |
| Vercel 배포 입력 | 비공개·임시·환경 파일 포함 0건, 실제 업로드 전 dry 확인 | `deploy-inputs.json` |
| Vercel 빌드·alias·commit | Ready, release commit metadata 일치, 운영 alias 승격 확인 | `vercel-deploy.log`, `vercel-promote.log`, `deployment-source.json`, `production-after.json` |
| 운영 health·서명 도움말·현황·공개 페이지 | 8/8 PASS; 명단 상세 2건은 현재 모집 없음으로 skip | `live-candidate.json`, `live-production.json` |
| private 설치본의 RECRUIT·FEATURES 인증 | 두 프로필 HTTP 200, command gateway 정상 | `installer-live.log` |
| 실제 휴대폰 설치·카카오 채팅방 송수신 | 미실시, 사용자 설치 후 확인 필요 | `PENDING_USER_INSTALL` |

실행 명령:

```powershell
node --import tsx --test tests/party-copy-snapshot.test.ts tests/kakao-form-snapshots.test.ts tests/kakao-v4-inhouse-copy.test.ts tests/kakao-v1-strict-server-replies.test.ts tests/kakao-party-detail-snapshot-p1.test.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-dispatcher.test.ts
node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v1-exact-v4-adapter-architecture.test.mjs tests/kakao-v1-strict-oracle.test.mjs tests/site-feature-boundary.test.mjs
$env:V2_DB_CONTRACT_SCOPE = 'recruiting'
$env:PG_BIN_DIR = 'C:\Program Files\PostgreSQL\18\bin'
npm.cmd run test:db
node scripts/audit-messengerbot-rhino-static.mjs integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js .private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js
npm.cmd run check
node scripts/check-secrets.mjs --tree-only
```

DB 검사는 loopback의 disposable PostgreSQL 18을 사용하며 운영 DB를 사용하지 않는다.

전체 검사의 DB 전용 skip 1개는 `db-contracts-final.log`의 격리 DB 실행에서 PASS했다. 전체 검증 결과가 경고 0이라는 의미는 아니다. 기존 과거 설치본·생성 JS 등에 걸린 lint 경고 319개는 이번 범위 밖으로 보존했다. 배포 입력 제외 규칙만 추가한 뒤 Vercel에서도 빌드·타입 검사가 통과했다. 원본 QA 로그의 공백과 Markdown 줄바꿈은 증거 보존을 위해 그대로 두었고, 소스의 staged diff 공백 검사는 통과했다.

추가 검증기의 최초 PostgreSQL 제약 수 기대값은 PG18 NOT NULL 제약을 제외하도록 바로잡았다(`migration-upgrade-harness-adjustment.log`). 후보 HTTP 검증은 Vercel CLI 인증 경로와 실제 안내 문구(`사이트 회원 이름`, `전체를 복사`)에 맞춰 확인한 뒤 최종 PASS했다. 제품 코드를 검사 통과 목적으로 변경하지 않았다.

이번 소스 보완 위치는 `src/modules/recruiting/kakao-assistant/postgres-kakao-assistant.ts`의 예비 공석 선택 2줄이며, `tests/database/kakao-assistant.contract.test.ts`에 실제 출력→파싱→재신청 회귀 검사를 추가했다. 봇 산출물은 변경하지 않았다.

## 운영 반영과 남은 확인

- 운영 DB·서버 적용 완료. 남은 순서는 **휴대폰 R24 전체 교체 → 컴파일 → 두 방의 봇버전·복붙 송수신 확인**이다.
- 서버 복구 지점: 실제 적용 직전 alias인 `dpl_GP6z2YRBuv9uS2FXHqNjzUhLFcXD`, `https://k-lol-ga92cu8fi-tjdmswo11-3715s-projects.vercel.app`. 단순히 더 오래된 카카오 R22 배포로 되돌려 후속 UI 변경까지 잃지 않는다. snapshot 테이블이나 기존 모집 데이터를 임의 삭제하지 않는다.
- 운영 logical archive: `.private/backups/r24-production-20260921/before-0040.dump`, 5,322,088 bytes, SHA-256 `66c6703dce5e063c2c59640ac75b79c9391ca8dbca4c7a5a1239e45dd2cb2acb`. `pg_restore --list` 확인 완료, 이 실제 운영 archive의 복원 실행은 하지 않았다. 백업 연결은 Node 공인 CA 묶음을 libpq에 지정해 `verify-full` 검증을 유지했다.
- 실제 휴대폰 기존 설치 버전은 미확인이다. 로컬 R22/R23 백업을 실제 직전 설치폰의 버전으로 단정하지 않는다.
- 운영일에 현재 모집이 없어 운영 명단 생성·참가·동시 신청은 실행하지 않았다. 해당 저장 경로는 격리 DB 검사 근거다. 실제 카카오톡 두 방 송수신, 회원·사이트 신청 표시, 동시 참가, 06:00 경계는 운영/실기기 확인이 남아 있다.
- 원본 코드의 만료 후 물리 삭제는 현재 요청당 최대 256건이며, 무트래픽 자동 정리는 보장하지 않는다.

원래 R24 정책·전체 구현 근거: [ADR 0010](../../architecture/0010-kakao-site-linked-copy-forms.md), [2026-09-20 QA](../kakao-r24-site-linked-copy-2026-09-20/README.md).

## 다음 패치 추천

1. **회원 확인 후 신청 연결**: 미등록·동명이인은 별도 확인 대기로 남으므로 가입 후 재입력 없이 연결하는 운영 흐름을 보완한다.
2. **모집 정보 전용 수정**: 활성 모집의 복사 참가는 시간·게임 수정용이 아니므로 권한을 확인하는 전용 변경 경로를 마련한다.
3. **만료 양식 원본 정기 정리**: 요청이 없어도 보존기간을 관리할 수 있도록 기존 운영 작업과 연계한다.
4. **실기기 복붙 회귀 확인**: 두 방의 동시 참가·예비 공석·사이트 선신청을 확인하고 설치본 크기 제한 여유도 기록한다.
5. **미게시 모집 취소**: 빈 DRAFT 생성 후 `번호ㅉ`는 진행 중 모집만 대상으로 한다. 사용하지 않을 빈 양식을 명시적으로 취소하는 흐름을 보완한다.

디스코드에 붙여 넣을 공지 초안: [DISCORD_NOTICE.md](./DISCORD_NOTICE.md). 외부 게시하지 않았다.
