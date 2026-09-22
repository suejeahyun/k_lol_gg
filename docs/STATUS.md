# K-LOL.GG V2 상태

## 2026-09-22 사이트 알림 1.0.3 — 오픈채팅 호환 수정 후보

- 1.0.2 설치 후 실기기 로그에서 INIT_READY → CALLBACK_RECEIVED → GROUP_REQUIRED를 확인했다. 사용자가 실제 내전 구인 오픈채팅방에서 실행한 것이라고 확인하여 그룹 표시 값의 falsey 판정이 무응답을 일으킨 지점으로 확정했다.
- 그룹 표시 값을 진단 정보로만 사용한다. 카카오톡 패키지 검사, 일회용 등록 코드, 서버 REGISTER 승인, 원래 Replier 대상 고정은 유지한다. 개인방/그룹방을 자동 구분하지 않으므로 수신할 실제 오픈채팅방에서 운영자가 직접 등록한다.
- [1.0.3 QA](./qa-evidence/site-notice-companion-v1.0.3-2026-09-22/README.md)와 새 비공개 설치본 준비. 서버·DB·일반 R25 변경 및 Git 게시 없음. 사용자 제공 09:32~09:33 실기기 로그에서 1.0.3 버전·진단 응답, 그룹 표시 호환 처리, 초기화 READY를 확인했다. 명령 무응답은 해결됐으며 수신 등록·실제 충원 수신은 아직 미확인이다.

## 2026-09-22 사이트 알림 1.0.2 — 휴대폰 진단 후보

- 사용자가 별도 알림 봇 설치·실행과 Legacy 설정을 확인했으나 버전 명령 무응답을 보고했다. 앞서 첨부한 37·218행 경고 사진은 사용자가 다른 코드 화면이라고 정정했으므로 원인 증거로 사용하지 않는다.
- 초기화 실패 시에도 버전·진단 명령을 처리하고 고정 코드만 로컬 로그에 남긴다. 실제 R25와 같이 원래 SDK Replier를 JS 함수로 감싸 호스트 메서드 타입 판정에 의존하지 않는다. 이것이 실기기 무응답의 원인인지 아직 확정하지 않았다.
- 공개 코드·빌더 및 비공개 1.0.2 설치본 준비. 운영 서버·DB·기존 R25 변경 없이 새 로컬 등록 코드만 발급했고 서버 대상 식별자는 유지했다. Git 게시·서버 배포·휴대폰 교체 완료로 표시하지 않는다.
- [진단 후보 QA](./qa-evidence/site-notice-companion-v1.0.2-2026-09-22/README.md), [변경 안내](./patch-notes/2026-09-22-site-notice-diagnostics.md). 실기기 진단 결과와 실제 충원 수신 확인이 남아 있다.

## 2026-09-22 사이트 알림·Riot API·운영 진단 1.0.0 — 운영 적용

- source `c3442ace1e04054ada05f1f6842f4699b45a0bb6`, Vercel `dpl_BdpAWrcHPKAchNU9K644dHfajNxu` READY·운영 alias 반영, DB head `0044` 유지. 08:41 KST 운영 health·인증 경계·기존 카카오 조회 PASS.
- Riot API 직접 연결·티어/최근 솔로 요약을 RSO 설정과 분리했다. 기존 운영 키를 유지하고 암호화·API/DB flag를 활성화했으며 실제 status-v4 수락 HTTP 200을 확인했다. RSO는 사용자 확인상 미승인이고 해당 기능은 준비 중이다.
- 이미 연결된 승인·활성 계정의 갱신을 5분당 최대 1건으로 예약했다. 예약 요청 최소 간격 6시간과 429 전체 대기를 적용한다. 현재 92건 모두 DISCONNECTED이며 임의로 연결하지 않았다. 실제 회원 League/Match 갱신은 소유자의 명시 연결 후 확인해야 한다.
- 운영자 `/admin`에서 통계·일일 마감·저장소·Riot API/RSO·사이트 알림 기록을 확인한다. 외부 수신처 장애 발송 없이 화면을 열거나 새로고침할 때 갱신한다.
- 사이트 충원 서버 알림 ON, 별도 활성 companion 1.0.1 설치 묶음 준비. 사용자가 설치·실행 확인한 일반 R25는 유지한다. companion 설치·그룹 등록·실제 충원 수신은 아직 미확인이다.
- 계약 424 PASS·단위 948 PASS(+DB 1 skip), 전체 PG 142 PASS, 인증 HTTP PASS, 105페이지·339화면 issue 0, 비밀 검사·원격 CI PASS. 08:45 KST 실제 Riot 예약 요청 200과 DB 인증 nonce 확인. [통합 QA](./qa-evidence/integrations-activation-v1.0.0-2026-09-22/README.md), [패치 공지](./patch-notes/2026-09-22-integrations-activation.md), [Riot 운영·RSO 신청](./operations/RIOT_ACTIVATION_RUNBOOK.md), [관리자 진단](./operations/ADMIN_OPERATIONAL_HEALTH_RUNBOOK.md).

아래 기록은 각 과거 릴리스 검증 시점의 상태다.

## 2026-09-22 운영 준비 보완 1.0.0 — 운영 적용

- source `c5cbbcd8a700a84c33283ab922bc1b5631e3123f`, Vercel `dpl_7FHerKERF1CKe4kFvN5DQkvUHX8k` READY·production. 운영 alias와 main의 서버 소스 일치, DB `0044_vengeful_trauma`. 기능별 tag·배포 ID는 [release registry](./releases/registry.json)에 연결했다.
- 파티 전체 목록·번호 직접 상세·초안 취소·저장 후 목록, 오전 6시 명단 보존 마감, 미확인 회원 연결 표시, 팀 전용 보정·확정 경기만 경력 집계, 통계 자동 갱신·실패 재시도와 운영 진단을 반영했다.
- 전체 계약 418 PASS·단위 934 PASS(+DB 전용 1 skip), 격리 DB 139 PASS, 인증 HTTP PASS, 105페이지·339화면 issue 0, 타입·ERD·빌드·비밀 검사 PASS. lint 오류 0·경고 55.
- 운영 DB 백업의 실제 복원·논리 스키마/행 수 일치, 신규 migration 재실행 no-op, 후보·운영 실제 Blob 업로드/내용검사/삭제/삭제확인 PASS. 통계 대기 4건은 예약 작업으로 처리된 것을 DB 기록으로 확인했다.
- 후보·운영 읽기 검사 PASS. 06시 마감 뒤 현재 모집 0건이어서 상세 조회 2종은 대상 없음으로 생략; 상세·저장·충돌 검증은 합성 DB 근거다. 운영 명단에 테스트 인원을 넣거나 실제 메시지를 발송하지 않았다.
- **휴대폰·Riot는 별도**: MessengerBot 앱 0.7.29a는 사용자 확인. 실제 JS 버전, companion 설치/등록·실카카오 수신은 미확인이고 알림은 OFF. 기존 R24/R25 일반 봇 교체는 필수가 아니다. Riot 자격·실계정 동의가 없어 연동은 OFF이며 최근 솔로 요약은 합성 gateway/DB까지 검증했다.
- [통합 QA·남은 위험·다음 권고 5개](./qa-evidence/operational-readiness-v1.0.0-2026-09-22/README.md), [한국어 패치 공지](./patch-notes/2026-09-22-operational-readiness.md), [운영·복구 절차](./operations/OPERATIONAL_READINESS_RUNBOOK.md), [휴대폰 알림 설치 안내](../integrations/messengerbot-r/site-notices/README.md).

## 2026-09-22 복사 양식 안정화 1.0.1 — 운영 적용

- source `b7798363f9b0caee847a654afe2dde07afbcb2f9`, tag `kakao-copy-reliability-v1.0.1`, Vercel `dpl_Enu7zPFs7kr4pqUpiveAhB7BKXDJ` READY·production. 00:58 KST 운영 alias·소스 metadata 확인.
- 앞선 복사 양식 안정화와 내전 패치를 함께 적용하고 공개 도움말 드리프트를 수정했다. 백업 후 운영 DB0041 적용·재실행 no-op·제약 유효·주요 상태별 건수 불변을 확인했다.
- 최종 전체 검사 계약410·단위902 PASS(+DB전용1skip), 빌드PASS. 동일 서버 소스의 격리DB86 PASS. 후보·운영 읽기21/21 각각PASS, 현재 파티3·내전3 상세 구조 확인. 운영로그15건 모두200·error/fatal0.
- R24 호환 VM70 PASS로 이번 서버패치의 필수 폰 교체는 없다. 실제 기기버전·카카오 송수신은 별도 미확인이다. 운영 명단의 테스트 생성·삭제와 외부 메시지 발송은 하지 않았다.
- [QA·백업·배포·복구·다음추천](./qa-evidence/kakao-copy-reliability-v1.0.1-2026-09-22/README.md), [디스코드 공지](./qa-evidence/kakao-copy-reliability-v1.0.1-2026-09-22/DISCORD_NOTICE.md), [패치기록](./patch-notes/2026-09-22-kakao-copy-reliability-production.md). 아래 미배포 기록은 각 과거 검증 시점의 상태이다.


## 2026-09-22 복사 양식 안정화 1.0.0 — 운영 미배포·R25 미설치

- `kakao-copy-reliability@1.0.0`: 코드가 있는 N인파티의 이름 삭제·교체·예비 이동·시작/게임 수정을 원본·현재·제출 비교로 병합한다. 같은 항목의 충돌은 전체 거절하고, 취소자 재등장·명단 행 누락·정원/종목 변조·코드의 자동생성 재사용을 차단한다.
- 마감 양식과 동시 마감 경쟁, 불완전한 명단, 번호 없는 내전상세에 구체적인 안내를 반환한다. 예비 빈칸을 번호순으로 표시하고 한국어 자모·표시 문자열을 보존한다.
- 구형 내전 이름 전용 양식의 기존 참가자는 발급 원본의 라인을 보완해 최신 변경을 보존한다. 신규·교체 협곡 참가자는 라인이 필요하며 SITE·운영진 보호는 유지한다. 무변경 응답을 신규 접수와 구분한다.
- 전체 `npm run check` exit 0: 계약 410 PASS, 단위 902 PASS·DB 전용 1 skip, lint 오류 0·기존 경고 326, 타입·ERD·프로덕션 빌드 PASS. 격리 PostgreSQL 18 모집 계약 86 PASS·0 skip.
- R25 공개·비공개 설치본은 생성했으며 실제 휴대폰 설치·채팅방 송수신은 미확인이다. 서버 배포·운영 DB 변경 없음. 신규 migration은 없고 이전 내전 패치의 `0041`을 계승한다.
- ADR 0011 중 편집·충돌·안내 관련 범위만 반영했다. 새 목록 UX, 전체 직접 상세 조회·초안 마감 등의 별도 개편은 남아 있다.
- [QA·산출물 해시·남은 위험·다음 추천](./qa-evidence/kakao-copy-reliability-v1.0.0-2026-09-22/README.md), [디스코드 공지안](./qa-evidence/kakao-copy-reliability-v1.0.0-2026-09-22/DISCORD_NOTICE.md), [패치 기록](./patch-notes/2026-09-22-kakao-copy-reliability.md)

## 2026-09-21 내전 복사 양식 1.0.0 — 운영 미배포

- `kakao-inhouse-copy@1.0.0`: 10인 내전 양식 정리, 협곡 라인 필수, 이름·라인·시간 편집, 회원 연결 안내, 전체 모집 목록, 명단 보존 마감.
- SITE·연결된 카카오·미연결 이름의 정원 합산과 동시 신청 잠금. 카카오 저장으로 10명이 되는 즉시 디스코드 대기 문구 출력.
- `npm run check`와 프로덕션 빌드 exit 0. 계약 410 PASS, 단위 873 PASS·DB 전용 1 skip, 격리 DB 86 PASS. 0040→0041 데이터 보존 업그레이드·새 설치·재실행 PASS.
- 운영 DB·Vercel 배포·휴대폰 설치는 수행하지 않았다. 공개/private R24 파일 변경 없음. 사이트 충원을 카카오방에 즉시 푸시하는 통로는 별도 구현이 필요하다.
- [QA·실제 출력 예시·남은 확인](./qa-evidence/kakao-inhouse-copy-v1.0.0-2026-09-21/README.md), [디스코드 공지](./qa-evidence/kakao-inhouse-copy-v1.0.0-2026-09-21/DISCORD_NOTICE.md), [패치 기록](./patch-notes/2026-09-21-kakao-inhouse-copy.md)

## 2026-09-21 카카오 R24 1.1.0 내전 이름 우선 접수

- 사용자 선택: 이름으로 먼저 접수하고 사이트 회원은 나중에 연결. 기존 미연결 이름도 카카오 명단·접수 인원에 포함하며 사이트 관리자 회원 연결 기능을 유지한다.
- 구형 확인 목록과 본문 중복 파싱, 초기 DRAFT 양식 재사용 거부, 시작 시간 수정 거부를 보완했다. 최신 시간·공지 및 원본과 현재가 같은 미연결 이름 정정을 허용하고 오래된 덮어쓰기·다른 방 신청 이동을 차단한다.
- 운영 반영: commit `0c188785315cd781a0e828ba1acc69f96acdbf28`, tag `kakao-r24-site-linked-copy-v1.1.0`, Vercel `dpl_FmnnD2FtSWmTm7Ks6zrZ8it78jF7` READY · Production. 운영 alias·제공자 소스 메타데이터 일치 확인.
- 검증: 격리 PostgreSQL 84/84, 계약 410/410, 단위 866 PASS·DB 전용 1 skip, 타입·ERD·프로덕션 빌드 PASS. lint 오류 0·경고 326.
- 운영 읽기 11건 HTTP 200와 내전 표시 인원 일치 2건, 총 13/13 PASS. 실제 운영 명단 변경 없이 #1 접수 1명·#2 접수 10명 표시 확인.
- R24 휴대폰 파일 SHA-256 불변, DB migration 없음. 실제 휴대폰 재접수·제보 연결 오류 원인은 미확인. 과거 거부된 요청은 재전송 필요, 동일인 추정에 따른 중복 정리는 하지 않았다.
- [QA·배포·남은 위험·다음 추천 3개](./qa-evidence/kakao-r24-name-first-2026-09-21/README.md), [디스코드 공지](./qa-evidence/kakao-r24-name-first-2026-09-21/DISCORD_NOTICE.md), [패치 기록](./patch-notes/2026-09-21-kakao-r24-name-first.md)

## 2026-09-21 카카오 R24 1.0.1 파티 양식 정리

- 사용자 예시대로 중간 참가 안내와 양식코드 괄호 설명을 제거하고 빈 줄 간격을 맞췄다. 사이트 연동·저장 정책은 유지한다.
- 서버 운영 반영: commit `33d7bf042ffda9f051588787d0cffb1a1ff7f71a`, tag `kakao-r24-site-linked-copy-v1.0.1`, Vercel `dpl_8jtg4dY911S3RAEjvtv9gv7nQa56` READY · Production. 제공자 소스 메타데이터 및 운영 alias 일치 확인.
- 집중 검사 46/46, 전체 `npm run check` exit 0 (계약 410/410, 단위 862 PASS·DB 전용 1 skip, 타입·ERD·빌드 PASS, lint 오류 0·경고 326).
- 운영 health `ready`와 카카오/웹 읽기 검사 8/8 HTTP 200. 운영 상세 양식 2건은 조회 대상 미선택으로 생략했으며 정확한 출력·파싱은 로컬 검사 근거다. 운영 명단 변경 없음.
- 공개/private 휴대폰 R24 산출물 SHA-256 불변, DB migration 없음. 실제 설치폰 버전·채팅방 송수신은 미확인. 구형 R22는 짧은 복붙 양식 저장에 기존 R24 설치가 필요하다.
- [QA·배포 근거·남은 확인·다음 추천 3개](./qa-evidence/kakao-r24-party-format-2026-09-21/README.md), [디스코드 공지](./qa-evidence/kakao-r24-party-format-2026-09-21/DISCORD_NOTICE.md), [패치 기록](./patch-notes/2026-09-21-kakao-r24-party-format.md)

## 2026-09-21 카카오 R24 복사·붙여넣기 복귀 재확인

- 사용자 확인: 파티·내전 **양식 전체 복사 → 빈칸에 이름 추가 → 전체 전송**, 사이트 연동 유지.
- 기존 R23/R24 미커밋 구현을 보존했다. 이번 보완은 내전 예비 앞번호 취소 후 빈칸이 출력되지 않던 문제로, 첫 빈 예비 번호를 다시 표시한다.
- 실제 출력 양식 복사·파싱·재신청 및 기존 참가자 보존을 격리 DB 회귀 검사로 추가했다. 수정 전 실패와 수정 후 통과 로그를 모두 보존했다.
- 검증: `npm run check` exit 0, 계약 410/410, 단위 862 PASS·DB 전용 1 skip, 격리 PostgreSQL 60/60, typecheck·ERD·프로덕션 빌드 PASS, lint 오류 0·기존 경고 319. 공개/private 산출물은 이전 R24 해시와 일치하며 ES5/Rhino 통과.
- 상태: 사용자 “적용해줘” 승인 후 운영 DB backup·migration 0040·서버 배포·alias 전환 완료. 휴대폰 설치는 사용자 교체 대기.
- 배포 commit `5d0e01c274fcb6d42b2cf574443b93fe4d27d8dd`, tag `kakao-r24-site-linked-copy-v1.0.0`, Vercel `dpl_6ZtchrtMHPisXZWNTeoR7HZ6GQCC` Ready · Production. 기능 브랜치/tag push 완료.
- 운영 alias health `ready`, 복붙 안내·사이트 연동 안내·두 프로필 인증 HTTP 200. 현재 운영일 모집이 없어 실제 운영 참가 명단 작성은 하지 않았으며 해당 저장 경로는 격리 DB 검증 근거.
- 추가 migration QA: 0039→0040에서 기존 102개 테이블 데이터·구조 보존, 별도 fresh 및 재실행 no-op. 배포 전 비공개·임시 파일 업로드 제외 확인.
- [QA·배포·산출물 해시·남은 위험·다음 패치 추천 5개](./qa-evidence/kakao-r24-copy-restore-2026-09-21/README.md), [디스코드 공지](./qa-evidence/kakao-r24-copy-restore-2026-09-21/DISCORD_NOTICE.md), [패치 기록](./patch-notes/2026-09-21-kakao-r24-copy-restore.md)

## 2026-09-20 카카오 R24 사이트 연동 복사 참가

- 상태: 소스·공개/private 생성물 및 로컬 검증 완료. 운영 배포·운영 DB migration·휴대폰 설치·커밋·태그 없음.
- 파티·내전 양식: 전체 복사 → 빈칸에 이름 → 전체 전송 → 결과와 최신 명단. 참가와 새 모집 안내를 분리.
- 내전은 사이트 회원·시즌 신청·기존 라인과 연동. SITE 출처·확정 상태 보존, 회원 확인 필요는 인원·예비와 구분.
- 짧은 원본 코드와 추가 전용 병합: 동시 신청 보존, 삭제·교체·기존 정보 덮어쓰기·탈퇴자 재등장 차단.
- 카카오 스크림 종료 유지, 과거 DB·웹·관리자 기록 보존.
- **배포 전 migration 0040 필수**. 새 snapshot 테이블·인덱스만 추가. 운영에는 적용하지 않았음.
- 검증: `npm run check` exit 0, 단위 862 PASS·DB 전용 1 skip, 계약 410/410, 격리 PostgreSQL 59/59, production build 93 pages, ES5/Rhino 경고 후보 0. lint 오류 0·경고 319.
- [QA·해시·남은 위험](./qa-evidence/kakao-r24-site-linked-copy-2026-09-20/README.md), [디스코드 공지 초안](./qa-evidence/kakao-r24-site-linked-copy-2026-09-20/DISCORD_NOTICE.md), [다음 패치 추천](./patch-notes/2026-09-20-kakao-r24-site-linked-copy.md)

## 2026-09-20 카카오 R23 파티·내전 복붙 우선

- 상태: 소스·공개/private 생성물 준비 및 로컬 검증 완료. 운영 서버 배포·휴대폰 설치·커밋·태그 없음.
- 파티·내전은 전체 양식 복사 → 이름 입력 → 전체 전송 → 최신 전체 양식. 주최자 입력 필수 아님.
- 운영일·저장기준으로 오래된 양식 덮어쓰기 방지, 구형 양식은 기존 정보 보존 추가만 허용.
- 카카오 스크림 명령·양식·도움말 종료. 과거 기록·웹 조회·관리자 대회 데이터 보존.
- DB migration·운영 데이터 직접 수정·삭제 없음. 기존 R22 private 백업 보존.
- 검증: 단위 800 PASS·DB 전용 1 skip, 계약 406/406, 격리 PostgreSQL 52/52, production build 93 pages, 공개/private ES5/Rhino 경고 0. 전체 lint 오류 0·경고 292.
- [버전별 QA·해시·남은 위험](./qa-evidence/kakao-r23-copy-first-rosters-2026-09-20/README.md), [공지 초안](./qa-evidence/kakao-r23-copy-first-rosters-2026-09-20/DISCORD_NOTICE.md)

## 2026-09-18 사이트 시각 효과·전체 화면 검수

- 기능 커밋: `9235bbbfd767b2775311c7b9a1dd77ac3584d97d`
- 릴리스 tag: `site-visual-effects-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·전체 화면 캡처·브라우저 품질·육안 검수·Git·Vercel 운영 배포 완료
- Vercel Production: `dpl_5zKtasDGL6ZUVeauVA8PL3CJTPK9` (`https://k-lol-303oj671s-tjdmswo11-3715s-projects.vercel.app`), Ready·Production
- 운영 별칭: `https://k-lol-gg.vercel.app/api/health` HTTP 200 · `status: ready`
- 주요 범위: 홈, 구인, 경기, 랭킹·MMR, 팀 밸런스, 이벤트 대회·멸망전, 미디어, 계정, 관리자 화면의 절제된 효과와 상태 가독성
- 전체 화면: 105/105 pages · 339/339 captures · HTTP 200 339 · 자동 감지 issue 0
- 브라우저 품질: 공개 핵심 9경로 × desktop/mobile/320px, 27/27 PASS, issue 0, 최대 LCP 344ms, CLS 0
- 테스트·빌드: 783개 중 782 PASS·DB 전용 1 intentional skip, production build 93 pages
- 접근성: 모션 감소·키보드 focus·forced-colors 경계 유지, 영상·파티클·새 애니메이션 의존성 없음
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/site-visual-effects-2026-09-18/README.md`](./qa-evidence/site-visual-effects-2026-09-18/README.md)에 있다.

## 2026-09-18 카카오 R22 간결 응답·미등록 회원가입 안내

- 기능 커밋: `4482bc071d4806946f1f78f23b763122b988a5a8`
- 상태: 소스·집중 회귀·격리 PostgreSQL·전체 앱 검사·Rhino 정적 검사·Git·Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 릴리스 tag: `kakao-r22-compact-roster-signup-v1.0.0`
- Vercel Production: `dpl_3GkXwSrViAMGtQUTQcHtLuSdFbBA` (`https://k-lol-6il0rhr1d-tjdmswo11-3715s-projects.vercel.app`), Ready·Production, 운영 alias `/api/health` HTTP 200 `ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R22_2026_09_18`
- 주요 범위: `수정` 별칭 지원, 내전 명단 `본명 / 닉네임` 간결 표시, 긴 닉네임 9자 말줄임, 미등록 참가자 회원가입 안내, 일반 응답의 반복 사용법 제거, `/구인도움말`로 도움말 집중
- 테스트: focused 44/44, MessengerBot·호환성 41/41, 스크림 회귀 7/7, 전체 DB 계약 PASS, 일반 782 PASS·1 intentional skip, 계약 401/401, 홈 여성 챔피언 가이드 68/68, 프로덕션 빌드 93 pages, 공개·비공개 ES5/Rhino 경고 후보 0건
- public 검토본: LF 63,720 / CRLF 65,528, SHA-256 `283c758142df12ba015cd6eed2ba33f08310997834a2364888ed76f3919d3465`
- private 설치본: LF 62,009 / CRLF 63,818, SHA-256 `7725ab9aa7ce9d8f97b0e1e0120c895e3743d3bdfa154ce6911fc2833cffe90d`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r22-compact-roster-signup-2026-09-18/README.md`](./qa-evidence/kakao-r22-compact-roster-signup-2026-09-18/README.md)에 있다.

## 2026-09-17 카카오 R21 내전 일반·예비 이중 입력

- 기능 커밋: `b6ead14aef8a8991bb519805ffdcd2f6c72ac699`
- 상태: 소스·집중 회귀·격리 PostgreSQL·전체 앱 검사·Rhino 정적 검사·Git·Vercel 운영 배포·라이브 서명 검증 완료, 휴대폰 MessengerBot R 설치 대기
- 릴리스 tag: `kakao-r21-inhouse-reserve-dual-input-v1.0.0`
- Vercel Production: `dpl_CzikbQKinnSZeDWJW9ovjdRKWfht` (`https://k-lol-53bugwtpf-tjdmswo11-3715s-projects.vercel.app`), Ready·Production, 운영 alias `/api/health` HTTP 200 `ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R21_2026_09_17`
- 주요 범위: 일반·예비 명단 채팅 추가/삭제, 전체 양식 예비 동기화·취소, 옛 양식 예비 보존, 일반·예비 정원 분리
- 테스트: focused 8/8 + MessengerBot 28/28, 전체 DB 계약 PASS, 일반 780 PASS·1 intentional skip, 계약 401/401, 홈 여성 챔피언 가이드 68/68, 프로덕션 빌드 93 pages, 공개·비공개 ES5/Rhino 경고 후보 0건
- public 검토본: LF 63,681 / CRLF 65,487, SHA-256 `5bce4e91ef38067d3206768407b599c9e16417d350dbbc26ca0de545ccb5cd43`
- private 설치본: LF 61,970 / CRLF 63,777, SHA-256 `aefe5a336a353bb397c57cbfc7ca036ce3a207a76ef8fe44206a7e4fb724b66e`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r21-inhouse-reserve-dual-input-2026-09-17/README.md`](./qa-evidence/kakao-r21-inhouse-reserve-dual-input-2026-09-17/README.md)에 있다.

## 2026-09-16 카카오 R20 내전 빠른 라인 입력

- 기능 커밋: `97ed27cfdadc09bf2e260987dce37e7364d4a57c`
- 상태: 소스·집중 회귀·격리 PostgreSQL·전체 앱 검사·Rhino 정적 검사·Git·Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 릴리스 tag: `kakao-r20-inhouse-quick-positions-v1.0.0`
- Vercel Production: `dpl_CmmJdtGvYaZJKZtBVHRJrjbkNK5V` (`https://k-lol-5zug11ush-tjdmswo11-3715s-projects.vercel.app`), Ready·Production, 운영 alias `/api/health` HTTP 200 `ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R20_2026_09_16`
- 주요 범위: `이름/mid/ad`·`이름/mid,ad`, `mid,all` 보완 확장, 동일 참가자 슬롯 유지 라인 수정, SITE·확정 신청 보호
- 테스트: focused 7/7 + MessengerBot 28/28, 격리 PostgreSQL recruiting 51/51, 일반 779 PASS·1 intentional skip, 홈 여성 챔피언 가이드 68장, 프로덕션 빌드 93 pages, 공개·비공개 ES5/Rhino 경고 후보 0건
- public 설치 검토본: LF 63,690 / CRLF 65,496, SHA-256 `240615cd3d09b9fde5c64cfd1dc51bc4c9675228b38e41441226b2239448f30c`
- private 설치본: LF 61,979 / CRLF 63,786, SHA-256 `e1c09efd76630f228becdc34bcc7f89fd1c658613e76ac7886d4a9c64aa7f649`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r20-inhouse-quick-positions-2026-09-16/README.md`](./qa-evidence/kakao-r20-inhouse-quick-positions-2026-09-16/README.md)에 있다.

## 2026-09-16 카카오 R19 랜덤 입장 안내 톤

- 기능 커밋: `a0310333d9ee7ff048944bef63495bebdd05c8e8`
- 상태: 소스·집중 회귀·전체 앱 검사·Rhino 정적 검사·Git·Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 릴리스 tag: `kakao-r19-random-join-tones-v1.0.0`
- Vercel Production: `dpl_8fzzJakpYoprXoNsUUBmP3RVNdxS` (`https://k-lol-fvbbulkfx-tjdmswo11-3715s-projects.vercel.app`), Ready·Latest·Production, 운영 alias `/api/health` HTTP 200 `ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R19_2026_09_16`
- 주요 범위: `오픈채팅봇`의 `입장시 할 일` 문구 인식, 환영·공지·게임·가벼운 퀘스트 네 톤 중 하나 선택, 필수 정보 공통 유지, 원시 입장 중복 억제
- 테스트: focused 47/47, 일반 779 PASS·1 intentional skip, 홈 여성 챔피언 가이드 68장, 프로덕션 빌드 93 pages, 공개·비공개 ES5/Rhino 경고 후보 0건
- public 설치 검토본: LF 63,671 / CRLF 65,480, SHA-256 `e4fbfba2695b89d2972d72ee0192c7c0dc9d3d0bfddc190a08c47e4f6442b48a`
- private 설치본: LF 61,957 / CRLF 63,764, SHA-256 `8f742076c8c7aa179e033805471cd97caa84382cc79379500baf548fdfefa61d`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r19-random-join-tones-2026-09-16/README.md`](./qa-evidence/kakao-r19-random-join-tones-2026-09-16/README.md)에 있다.

## 2026-09-16 카카오 R18 신규 입장 안내

- 기능 커밋: `1fc6e5fc63d429d82b05acc2cddc29efbd58dffa`
- 상태: 소스·집중 회귀·전체 앱 검사·Rhino 정적 검사·Git·Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 릴리스 tag: `kakao-r18-join-guides-v1.0.0`
- 운영 배포: `dpl_H9LFWVMfxLYe3FBts2uKqzWAER6C`
- 운영 URL: `https://k-lol-5tqmcg82l-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R18_2026_09_16`
- 주요 범위: 입장 시 닉네임 변경, 구인구직방, 디스코드 안내를 순서대로 로컬 전송
- 테스트: focused 46/46, 일반 779 PASS·1 intentional skip, 홈 여성 챔피언 가이드 68장, 프로덕션 빌드 93 pages
- public 설치 검토본: LF 63,476 / CRLF 65,285, SHA-256 `ea71eb7fb533e812d265969f989a72be83a1e552b164576251dd3c7f1f7963bb`
- private 설치본: LF 61,690 / CRLF 63,496, SHA-256 `cb4ff5b4cc151b67a96198e41ca127ccf02daf818155f3263d5f9479ce2a6c52`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r18-join-guides-2026-09-16/README.md`](./qa-evidence/kakao-r18-join-guides-2026-09-16/README.md)에 있다.

## 2026-09-14 카카오 R17 내전 종목별 전체 양식

- 기능 커밋: `0bc6d9552a3dbe8ce4c842ea0f8ed021b327b794`
- 상태: 소스·전체 앱 검사·격리 PostgreSQL·Rhino 정적 검사·Vercel 운영 배포·라이브 서명 검증 완료, 휴대폰 MessengerBot R 설치 대기
- 릴리스 tag: `kakao-r17-mode-forms-v1.0.0`
- 운영 배포: `dpl_E4BS9JnU8cdxR4cb2343EBQp25zK`
- 운영 URL: `https://k-lol-fn0awjv8i-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R17_2026_09_14`
- 주요 범위: 파티 무변경, 협곡 티어·라인 10칸, 칼바람·증바람 이름 10칸, 양식 전송 후 활성화, 이름만/상세 빠른 추가 병행
- 테스트: focused 102/102, 일반 779 PASS·1 intentional skip, PostgreSQL 전체 계약, static generation 93/93, 운영 RECRUIT·FEATURES 서명 요청 HTTP 200
- private 설치본: LF 61,326 / CRLF 63,126, SHA-256 `b8f7577e84ca6f3a45e98b981f88ec74f12648824ec13c94dbe217229275cd8f`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r17-mode-forms-2026-09-14/README.md`](./qa-evidence/kakao-r17-mode-forms-2026-09-14/README.md)에 있다.

## 2026-09-14 카카오 R16 내전·파티 동일 흐름

- 상태: 소스·전체 앱 검사·격리 PostgreSQL·Rhino 정적 검사·Vercel 운영 배포 완료, R17로 대체, 휴대폰 MessengerBot R 설치 대기
- 기능 커밋: `04404e61de21940a1eee7c98682ce3a1046fe1a2`
- 운영 배포: `CjPCThSJRKUcDCLQ3VAAqnEYa8Wa`
- 릴리스 tag: `kakao-r16-inhouse-party-flow-v1.0.0`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R16_2026_09_14`
- 주요 범위: 내전 양식 생성→작성→활성화, 주최자 1번 자동 참가, 상세 추가·삭제·마감, 최신 상세 응답, 기존 전체 양식 호환
- private 설치본: LF 61,918 / CRLF 63,731, SHA-256 `0075b557a72e0b087da4b8c967e724b7235e6fef1712373e693935f5cd483463`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r16-inhouse-party-flow-2026-09-14/README.md`](./qa-evidence/kakao-r16-inhouse-party-flow-2026-09-14/README.md)에 있다.

## 2026-09-14 카카오 R15 내전 전체 양식 무응답 수정

- 기능 커밋: `6e2195c7d6e3f1f4c19f10a01d274d922d519275`
- 릴리스 tag: `kakao-r15-all-mode-snapshot-v1.0.0`
- 상태: 소스·전체 앱 검사·카카오 회귀·격리 PostgreSQL·Vercel 운영 배포·라이브 API 검증 완료, 휴대폰 MessengerBot R 설치 대기
- 운영 배포: `HHi9vL5Ynji5fMZWQ1WqN2FVcGHq`
- 운영 URL: `https://k-lol-m00yikghu-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R15_2026_09_14_ALL_MODE_SNAPSHOT`
- 제보 재현: 증바람 #4 완성 양식이 `게임정보` 때문에 파티로 오인되어 HTTP 0회·응답 0회
- 수정 검증: 동일 원문이 FEATURES 게이트웨이로 1회 전달되고 응답 1회, 불완전 양식은 계속 차단
- private 설치본: LF 61,165 / CRLF 62,964, SHA-256 `06106d007879cc9f29451ed1960414219d8c11628e8ec3aa6f4f3a1c6b0b16b7`
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r15-all-mode-snapshot-2026-09-14/README.md`](./qa-evidence/kakao-r15-all-mode-snapshot-2026-09-14/README.md)에 있다.

## 2026-09-14 카카오 R14 Rhino 반환·주석 정리 운영 릴리스

- 기능 커밋: `c12683c1794eb6f9d61fc950b113ad30328eb8d6`
- 릴리스 tag: `kakao-r14-rhino-clean-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·Vercel 운영 배포·라이브 API 검증 완료, 휴대폰 MessengerBot R 설치 대기
- 운영 배포: `AdxpFyJ2Jbi7VA7vL4ssQi2RMXho`
- 운영 URL: `https://k-lol-6zdv6s72b-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 테스트: 일반 779개 중 778 PASS·DB 전용 1 skip, PostgreSQL 전체 계약, 카카오 focused 48/48, static generation 93/93
- private 설치본: R14, LF 61,119 / CRLF 62,918, SHA-256 `17bd22219237a8d821fe354e05cbab65f542a7828ba6e519273ff59767b90caf`
- 주요 범위: Rhino `#1798` 혼합 return 제거, 생성본 JavaScript 주석 0건, 혼합 return 0건 정적 차단
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r14-rhino-clean-2026-09-14/README.md`](./qa-evidence/kakao-r14-rhino-clean-2026-09-14/README.md)에 있다.

## 2026-09-14 카카오 내전·스크림 번호 마감 R13 운영 릴리스

- 기능 커밋: `3bf2aa5fdef1d135c15b6c25646676b86467d256`
- 릴리스 tag: `kakao-r13-scoped-finish-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·private gateway 검증 및 Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 운영 배포: `9d6ZCVgCB6rFRzKxwJaAhkfHmhus`
- 운영 URL: `https://k-lol-m0nwiyr4f-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 테스트: 일반 779개 중 778 PASS·DB 전용 1 skip, PostgreSQL 전체 계약, 내전·스크림 마감 4/4, static generation 93/93
- private 설치본: R13, LF 61,450 / CRLF 63,255, SHA-256 `348ad262701f834d983dc432c80552b7d556a7c07b71c6c374c75e8bb5a14c6e`
- 주요 범위: `내전 Nㅉ`, `/내전 Nㅉ`, `스크림 Nㅉ`, `/스크림 Nㅉ` 번호 마감, 동일 방 일반 사용자 허용, 최신 현황 응답, 다른 방·운영일·종료 상태·SITE 및 확정 신청 보존
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-r13-scoped-finish-2026-09-14/README.md`](./qa-evidence/kakao-r13-scoped-finish-2026-09-14/README.md)에 있다.

## 2026-09-14 카카오 파티 주최자 자동 참가 운영 릴리스

- 기능 커밋: `bd4a2ea506120883ec1513827cc6abdbe165d92d`
- 릴리스 tag: `kakao-party-organizer-auto-member-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·private gateway 검증 및 Vercel 운영 배포 완료
- 운영 배포: `dpl_HK7Yr8GJSRNjpTbxwZLkD6n6ermi`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 테스트: V1 호환 70/70, 파티 domain 22/22, 일반 774 PASS·DB 전용 1 skip, PostgreSQL 전체 계약, static generation 93/93
- 주요 범위: 참가행 없는 파티 양식 최초 활성화 시 주최자를 1번 참가자로 원자적 등록, 재전송·동일 이름 추가 중복 방지, 삭제 후 자동 재삽입 방지
- 휴대폰 MessengerBot R R12 변경·재설치: 없음
- DB migration·운영 데이터 직접 수정·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-party-organizer-auto-member-2026-09-14/README.md`](./qa-evidence/kakao-party-organizer-auto-member-2026-09-14/README.md)에 있다.

## 2026-09-13 카카오 V1 strict R12 알림 중복·양식 활성화 보완

- 기능 커밋: `c6b5c9f0c9d22f9474828c297521c2f56fb4fcaa`
- 릴리스 tag: `kakao-r12-transcript-dedupe-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·private 연결 검증 및 Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 운영 배포: `dpl_HAhkug5Sq5XVzKNA8Gg4tuauCknR`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 테스트: 카카오 focused 54/54, 계약 394/394, 일반 774 PASS·DB 전용 1 skip, PostgreSQL 전체 계약·HTTP·브라우저, static generation 93/93
- private 설치본: R12, LF 61,368 / CRLF 63,173, SHA-256 `646b04dbbc101656b0d4a9e87b4068bab2eb32c6611d0ad62b9068c774d8a9c4`
- 주요 범위: 정상 외부 로딩 안내 유지, 외부 안내 재처리 차단, 동일 logId 가시 답장 중복 억제, 무인자 내전구인 선택 안내, 파티 #11 전체 양식 활성화 회귀
- DB migration·운영 데이터 변경·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-transcript-dedupe-r12-2026-09-13/README.md`](./qa-evidence/kakao-transcript-dedupe-r12-2026-09-13/README.md)에 있다.

## 2026-09-13 카카오 V1 strict R11 설치본 정합성 긴급 수정

- 기능 커밋: `56c8f33eeef4de3986a6e373234d3678c5ee2ccb`
- 릴리스 tag: `kakao-v1-r11-private-installer-hotfix-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·private 연결 검증 및 Vercel 운영 배포 완료, 휴대폰 MessengerBot R 설치 대기
- 운영 배포: `dpl_H9QGLqUs1d16PsoLwWybiQoXRtWF`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 테스트: 계약 392/392, 일반 773 PASS·DB 전용 1 skip, PostgreSQL recruiting 49/49, private/client/architecture 26/26, static generation 93/93
- private 설치본: R11, LF 61,135 / CRLF 62,912, SHA-256 `fb21ea0aeb65f7f878b080edea8b099bc7409b3a3042551af5e72a021c0516bf`
- 원인: 설치 안내의 private 파일이 R9에 남아 참가행 없는 R11 주최자 양식을 명령으로 분류하지 못하고 무응답 종료
- DB migration·운영 데이터 변경·삭제: 없음

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-v1-r11-private-installer-hotfix-2026-09-13/README.md`](./qa-evidence/kakao-v1-r11-private-installer-hotfix-2026-09-13/README.md)에 있다.

## 2026-09-13 관리자 지정·비공개 Blob OIDC 운영 릴리스

- 기능 커밋: `b48465ac781d5f17679e4911cebc03b0d50aec8f`
- 릴리스 tag: `admin-player-role-promotion-v1.0.0`, `private-blob-oidc-v1.0.0`
- 상태: 소스·전체 테스트·격리 PostgreSQL·격리 Chromium 검증 및 Vercel 운영 배포 완료
- 운영 배포: `dpl_GJQWShTTiDt5DbM39MkMf3hzYRPc` · main `6b76a2f3749fb394c090f3bd120e98e5fadaf9ae`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 전체 화면: 105 pages / 339 captures / issue 0 / 종료 코드 0
- 테스트: 749개 중 748 PASS, DB 전용 1 skip, 실패 0
- 프로덕션 빌드: static generation 93/93
- DB migration·운영 데이터 변경·삭제: 없음
- 주요 범위: 플레이어 상세의 SUPER_ADMIN 전용 일반 계정→ADMIN 지정, 연결 계정 revision/상태 표시, Vercel Private Blob OIDC `BLOB_STORE_ID` 인식

전체 근거는 [`qa-evidence/admin-player-role-promotion-2026-09-13/README.md`](./qa-evidence/admin-player-role-promotion-2026-09-13/README.md), [`qa-evidence/private-blob-oidc-2026-09-13/README.md`](./qa-evidence/private-blob-oidc-2026-09-13/README.md)에 있다.

## 2026-09-13 카카오 파티·내전·스크림 통합 수명주기 운영 릴리스

- 기능 커밋: `249a1bf24e27dac0f5c59103bc6d5b3ea0c80743`
- 예정 릴리스 tag: `kakao-all-mode-draft-lifecycle-v1.0.0`
- 상태: 소스·빌드·격리 PostgreSQL·Neon production migration 및 **Vercel 운영 배포 완료**, 휴대폰 MessengerBot R 설치 대기
- 운영 DB: `0039_massive_arachne`, migration 40개, 신규 enum·column·constraint 사후 검증 완료
- 운영 배포: `dpl_FaX8XujaQQrBY9ntwixwQTgQooAZ`
- 운영 별칭: `https://k-lol-gg.vercel.app` · `/api/health` HTTP 200 · `status: ready`
- 테스트: 계약 390/390, 일반 771 PASS·DB 전용 1 skip, PostgreSQL recruiting 49/49·operations 1/1, static generation 93/93
- 공개 API: 파티 10건 모두 `IN_PROGRESS`, 공개 초안 0건, `organizerText` 10/10
- 주요 범위: 파티·내전·스크림의 번호 예약 초안, 전체 양식 활성화, 빠른 추가·삭제, 최신 현황, 06:00 KST 이전 운영일 종료
- 휴대폰 코드: V1 strict R11, SHA-256 `B2E7E214F949F766B48EB8FE530A8B27F2459DEBFC5C61CD03F79977E1E67DB7`, `PENDING_USER_INSTALL`

전체 근거와 디스코드 공지는 [`qa-evidence/kakao-all-mode-draft-lifecycle-2026-09-13/README.md`](./qa-evidence/kakao-all-mode-draft-lifecycle-2026-09-13/README.md)에 있다.

## 2026-09-13 UI·운영 흐름 보완 운영 릴리스

- 최신 기능 커밋: `fd87e5f47703f92f09e1d4db70617ee2aa49fc92`
- 릴리스 tag: `ui-workflow-refinement-v1.0.1`
- 상태: 소스·빌드·격리 PostgreSQL·격리 Chromium 검증 및 **Vercel 운영 배포 완료**
- 운영 배포: `dpl_48xow9mENhg2BrSAZyFdBD4giJQZ` · main `477651491ce9feef404f5cba186602f1fb481036`
- 전체 화면: 105 pages / 339 captures / issue 0 / 종료 코드 0
- 테스트: 747개 중 746 PASS, DB 전용 1 skip, 실패 0
- 프로덕션 빌드: static generation 93/93
- DB migration·운영 데이터 변경·삭제: 없음
- 주요 범위: 티어 10종 + 우측 단계/LP 입력기, 멸망전 우승 사진 캐러셀, 구인 참가자 이름, 내전 시간 표시 제거, 이벤트 대회·멸망전 독립 경로

전체 근거는 [`qa-evidence/ui-workflow-refinement-2026-09-13/README.md`](./qa-evidence/ui-workflow-refinement-2026-09-13/README.md), 티어 입력 구조 정정 근거는 [`qa-evidence/tier-control-correction-2026-09-13/README.md`](./qa-evidence/tier-control-correction-2026-09-13/README.md)에 있다.

## 2026-09-13 전체 검증·보완 운영 릴리스

- 기능 커밋: `dfb0ccb787d1602804c2019c7a87594de77d1661`
- 릴리스 tag: `v2-completion-audit-v1.0.0`
- 상태: 소스·빌드·합성 PostgreSQL·격리 Chromium 검증 및 **Vercel 운영 배포 완료**
- 전체 화면: 103 pages / 335 captures / issue 0 / 종료 코드 0
- 테스트: 742개 중 741 PASS, DB 전용 1 skip, 실패 0
- Drizzle application schema: 102 tables / 165 foreign keys
- recovery physical schema: migration journal table 포함 103 tables
- 운영 DB 변경·데이터 삭제: 없음
- 남은 외부 확인: Vercel Cron 실제 실행, MessengerBot R 실기기 두 방, 실제 Riot RSO/API, 실제 Vercel Blob

전체 근거와 요구사항 판정은 [`qa-evidence/v2-completion-audit-2026-09-13/README.md`](./qa-evidence/v2-completion-audit-2026-09-13/README.md)에 있다. 아래 내용은 직전 Kakao R8 운영 배포 기록이다.

- 운영 검증 확인 시각: 2026-09-12T13:36:38.587Z (2026-09-12 22:36:38 KST)
- 운영 검증 기능 기준: `2f576d939498d664db8962460ddf12200623b5c9`
- 릴리스 tag: `kakao-v1-r8-player-edit-qa-v1.0.0`
- 현재 단계: Kakao R8 서버 대응·플레이어 편집 브라우저 QA 운영 배포 완료, 휴대폰 R8 설치 대기
- V1 코드 복사: 없음. V1은 기능 목록과 동등성 대조 근거로만 사용
- V1 기준선: 블루·블랙 Vercel 기준선 저장소를 변경하지 않음
- 운영 Vercel: 배포 `dpl_2hAKT6xuYPHsTTUgHuKzsZskMXxa`, 불변 URL `https://k-lol-7rtp1k24x-tjdmswo11-3715s-projects.vercel.app`, deployment `Ready`
- 운영 별칭: `https://k-lol-gg.vercel.app`, `2026-09-12T13:36:38.587Z`에 `/api/health` HTTP 200·JSON `status: ready` 확인
- 운영 DB: migration 38개, head `0037_swift_brood` 확인
- Kakao 구인·내전 입력 복구: `v1.0.1` 사이트·서버 운영 배포와 health 확인 완료
- 휴대폰 Kakao V1 strict R8: `PENDING_USER_INSTALL`; MessengerBot R 설치·실제 Kakao 송수신은 미확인

## 2026-09-12 기록 당시 확인된 상태

- 현재 소스에는 공개·계정·관리자 영역을 포함한 105개 `page.tsx`가 있다.
- 새 Riot ID와 신규 플레이어를 함께 만드는 일반 사용자 가입은 같은 transaction에서 `APPROVED`·`ACTIVE`로 자동 승인된다. 기존 플레이어와 일치하는 Riot ID는 `PENDING` claim 수동 검토를 유지한다.
- 기존 `PENDING` 27개는 safe class와 action-time 조건을 확인한 뒤 별도 운영 작업으로 승인했고 `PENDING`은 27개에서 0개가 됐다. 연결 플레이어는 기존 `ACTIVE` 23개 유지·4개 재활성화로 모두 `ACTIVE`이며, 세션 6개 폐기, status history 27개, 계정 audit 27개, 플레이어 audit 4개를 기록했다. 기존 `REJECTED/SUSPENDED` 8개는 변경하지 않았다.
- 2026-09-07 시점의 100개 화면은 326개 조건(데스크톱 156, 태블릿 85, 모바일 85)에서 non-200·화면 이슈·가로 넘침 0건, 브라우저 품질 27/27 통과를 확인했다.
- 현재 105개 화면 339회의 익명·로그인·관리자·초기설정 실캡처를 합성 PostgreSQL과 격리 Chromium에서 완료했다. HTTP 오류·탐지 이슈·가로 넘침은 0건이고 자격증명과 운영 데이터는 산출물에 포함하지 않았다.
- 관리자 페이지는 익명·ACCOUNT 세션을 거부하고 ADMIN/SUPER_ADMIN 역할 경계를 유지한다.
- 현재 저장소 기준 최종 `npm run check`에서 전체 747개 중 746 pass·1 intentional skip, production build static generation 93/93가 통과했다.
- migration journal과 SQL은 각각 38개로 일치하고 `npm run test:db`가 통과했으며, 저장소 migration head는 `0037_swift_brood`이다.
- 같은 DB 검사에서 Kakao V4 P0 31/31과 recovery archive 검증이 통과했다.
- 운영 배포된 Kakao 입력 복구 릴리스는 구인 운영일을 KST 오전 6시 경계로 계산한다. 이는 이전 행을 삭제하는 초기화가 아니라 새 운영일 조회에서 이전 운영일 구인을 제외하는 논리 리셋이다.
- 구인 참가자 추가·수정·빈 슬롯 삭제·마감 성공 뒤 최신 전체 현황을 이어서 표시하며, 후속 현황 조회만 실패하면 mutation 성공은 유지하고 재조회 안내를 표시한다.
- 내전 신청 후보는 번호 뒤 공백, 들여쓰기, 대소문자 포지션, `ALL`, `Mid all`, `TOP, MID`, 이름만·부라인 공란, 중복 슬롯과 빈 행 취소를 처리한다. 정상 행은 반영하고 불완전·중복 플레이어 행만 확인 필요로 분리하며 `SITE`, `CONFIRMED`, 다른 방 신청은 보존한다.
- Kakao 릴리스 focused 검증은 V41 28/28, JavaScript 31/31, V1 strict 12/12, 내전 파서·서비스 22/22, 격리 PostgreSQL recruiting 계약 42/42가 통과했다. TypeScript·변경 범위 lint·Rhino 정적 검사도 통과했다.
- Kakao 내전 회차는 종목·정원·시작 시간·공지·revision을 별도 저장하고, 전체 양식의 명단 추가·수정·취소와 같은 transaction에서 갱신한다. `내전현황`과 상세는 저장값을 출력하며 기존 메타데이터 없는 회차만 협곡·21:00·10명 fallback을 사용한다.
- 내전 시간·공지 릴리스의 최신 검증은 V1 strict 14/14, parser/dispatcher 44/44, 전체 DB 계약 PASS이며 전체 `npm run check`는 725개 중 724 PASS·DB 전용 1개 intentional skip, production build 92 pages PASS다.
- 운영 Neon은 자동 만료 복구 분기 `pre-0037-inhouse-metadata-20260912` 생성 후 `0037_swift_brood`를 적용했다. 사후 조회에서 migration hash, 신규 테이블, 인덱스 3개와 세 종목 제약을 확인했다.
- SUPER_ADMIN은 사용자 계정 목록의 `관리자 지정`에서 APPROVED·미삭제 USER를 플레이어 연결 여부와 관계없이 ADMIN으로 변경할 수 있다. 역할 UI는 SUPER_ADMIN에게만 표시하고 일반 ADMIN은 입력 검증 전에 403으로 차단한다. 변경 시 기존 세션 폐기, revision·멱등성·감사 로그와 다음 관리자 로그인 TOTP 등록을 유지한다.
- 승인된 활성 사용자는 내 정보에서 Riot ID·현재 티어·최고 티어를 수정할 수 있고 ADMIN·SUPER_ADMIN도 플레이어 상세에서 같은 항목을 수정할 수 있다. 티어 전용 변경은 Riot 연결을 유지하고, Riot ID 변경은 같은 transaction에서 기존 연결 해제·PUUID 제거·작업 취소·감사를 수행한다. 저장 충돌은 모두 rollback하며 재연결은 등록부 Riot ID와 일치할 때만 허용한다.
- 운영 Neon production의 연결 중 Riot ID와 플레이어 등록 Riot ID가 다른 행은 읽기 전용 집계에서 0건이었다. 본인·관리자 중복 충돌 rollback과 멱등 replay는 link·job·audit의 revision과 건수까지 실제 PostgreSQL HTTP 테스트로 고정했다.
- 운영 Neon production은 비밀값 비노출 read-only preflight에서 기존 migration 35개, CONNECTED identity·owner 중복과 player-owner mismatch 0을 확인했다. 자동 만료 1일 복구 분기 `pre-0035-0036-20260911` 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다.
- 운영 DB 사후 검증은 migration 37개, head hash `ebb200d8597ed63d270c2a66a7369dd67d3536c238939458aeed337028bdc63f`, Riot unique index 2개, player-owner index 1개, validated foreign key 1개이며 중복·mismatch는 모두 0이다.
- Drizzle TypeScript application schema와 최신 snapshot은 102개 테이블·165개 foreign key를 정의한다. 복구 훈련의 physical table 103개는 migration journal table을 포함한다.
- 2026-09-07 PostgreSQL 18 QA에서 DB 기반 인증·계정·플레이어·시즌 HTTP, 로그인 제한, 비밀번호+TOTP, 쿠키, 역할, 보안 헤더, 로그아웃, 복구 훈련과 운영 fixture 차단이 통과했다.
- 현재 추적·미추적 tree와 전체 Git 이력 비밀정보 검사, `verify:auth-http`가 모두 통과했다. `.private/`는 Git과 Vercel 업로드에서 제외된다.
- 고정 Data Dragon 기준 챔피언 173종·자산 346개와 여성 홈 가이드 68/68을 확인했다.
- 2026-09-07 검증에서 `npm audit --omit=dev --audit-level=moderate` 결과 운영 의존성 취약점은 0건이었다.

2026-09-07 화면 원본과 모음 이미지는 [`qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md`](./qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md)에 있다. 현재 V1 팀 밸런스·결과 공유 운영 릴리스는 [`qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md`](./qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md), 최신 Kakao R8·플레이어 편집 QA 운영 릴리스는 [`qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/README.md`](./qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/README.md), 프로젝트 규칙·ERD·UI 재사용 검증은 [`qa-evidence/project-governance-erd-reuse-2026-09-11/README.md`](./qa-evidence/project-governance-erd-reuse-2026-09-11/README.md)에 있다.

## 2026-09-12 기록 당시 구현된 범위

- 밝고 가벼운 Community Breeze 디자인, 여성 챔피언 중심 브랜드 비주얼, 반응형 사용자/관리자 셸
- 가입 자동승인·로그인·TOTP·계정 수동 승인/복구/역할/플레이어 claim과 본인 Riot ID·티어 관리
- 플레이어 등록부, 시즌 참가, 경기 접수·OCR 검토·수정·게시·무효화·복구
- 시즌 통계·MMR·팀 밸런스·랜덤 팀·코인 토스
- 이벤트전·멸망전의 참가, 팀, 대진, 결과 정정, 경매, 교체, MVP 수명주기
- 구인·스크림·서명 Kakao 읽기/운영 폼/일일 종료 작업
- 하이라이트·갤러리·비공개 자산·징계 증거·Riot 연동 작업·운영 로그/설정
- PWA 설치와 V1 호환 redirect 진입점
- 외부 미디어 장애 시 깨진 이미지 대신 명시적인 복구 안내, YouTube 클릭 후 로드

## 2026-09-12 기록 당시 운영 상태와 남은 조건

최신 Kakao 기능 commit과 tag, Vercel deployment, 운영 별칭 health와 운영 DB head를 확인했다. 이 범위에서 사이트·서버 운영 반영을 확인했다. 아래 항목은 별도의 운영 권한·실기기·실데이터 근거가 있어야 완료로 판정한다.

이후 `account-auto-approval-v1.0.0`이 운영에 배포되어 신규 일반 사용자 자동승인과 `/signup`·`/start` 안내를 확인했다. 기존 승인 대기 27개는 앱 배포와 분리된 운영 작업으로 2026-09-12 05:52 KST 전후 승인했으며, 관리자 승인 대기·삭제 계정 승인 대기·미해결 claim은 각각 0개였다. 데이터 삭제와 스키마 migration은 없었다.

- 로그인·관리자 화면을 포함한 103개 페이지 335회 실캡처와 인증 사용자 흐름 전체 확인
- 승인된 기존 27개 계정의 로그인 실패율과 재문의 발생 여부 확인
- 자동 만료 1일 복구 분기 보존 시간 안의 DB 오류 지표와 무결성 위반 재확인
- V1 strict R8 private 전체 설치본의 SHA-256을 대조하고 MessengerBot R에 한 번에 교체한 뒤 `봇버전`과 실제 두 Kakao 방 송수신 확인
- R8에서 완전히 빈 내전 양식, 수정한 시간·공지·참가자와 빈칸 취소가 `내전현황`에 유지되는지 실제 방에서 확인
- 오래된 전체 내전 양식 충돌을 탐지할 revision/base-token을 V1 화면 호환 방식으로 설계
- Kakao V4 서명 HTTP는 운영 서버에서 확인했지만 실제 휴대폰 E2E, 재시도, 줄바꿈과 체감 지연은 미확인
- 실제 사용자 Riot RSO/API와 Vercel Blob 업로드·읽기·삭제 E2E는 완전히 검증하지 않음
- 운영 도메인 CSP/WAF/관측/알림/cleanup scheduler 확인
- V1 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없어 명시적 0/미제공 경로 사용

## 2026-09-12 기록 당시 다음 패치 추천

1. Vercel Production에 별도 `CRON_SECRET`을 설정하고 기능 커밋을 배포한 뒤 alias health와 오전 6시 예약 호출을 기록한다.
2. 실제 휴대폰에서 R8 private 전체 설치본 hash와 `/봇버전`을 대조하고 두 Kakao 방 canary를 기록한다.
3. 승인된 실제 사용자 계정으로 Riot RSO와 Blob 업로드·읽기·삭제 E2E를 각각 기록한다.
4. 오래된 내전 전체 양식 충돌을 V1 표시 형식을 유지하는 revision/base token으로 탐지한다.
5. 개인정보 없이 팀 계산 실패율, 결과 복사 성공·실패율과 수동 교체율을 관측하고 목표값은 운영자 승인 후 정한다.
