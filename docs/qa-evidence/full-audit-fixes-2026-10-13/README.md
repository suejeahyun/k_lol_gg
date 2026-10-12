# 전체 점검 개선 릴리스 근거 — 2026-10-13 KST

## 현재 상태

**`full-audit-fixes@1.0.0` 운영 반영 완료.** source `5b3a616749f17ae5199ba599bf6bb4ac6f50ff24`, tag `full-audit-fixes-v1.0.0`, migration `0048_mmr-game-source-history`. Vercel `dpl_8hhjPC8sMT12bB7ZTCtQavyPcchX`의 READY·동일 source·운영 alias·health를 확인했고 운영 HTTP 34조건과 배포 후 DB 무결성 점검이 통과했다. [배포·복구 근거](production.md). 작업 시작 commit은 `440433a27a2a9df2a012b4cc315e872acf5cb06d`이며 checkout은 `full-audit-fixes-20261013`이다.

[원본 전체 감사](../full-audit-2026-10-13/README.md)의 재현 결함과 구체적인 개선을 반영했다. 당시 감사 기록은 수정 전 근거로 유지하며, 현재 상태는 이 디렉터리와 아래 최종 결과를 기준으로 읽는다. 사용자에게 확인된 **카카오 실기기·방 확인, MMR v2 적용은 완료 상태를 유지**한다.

- [한국어 패치 노트](../../patch-notes/full-audit-fixes-v1.0.0.md)
- [데이터·MMR·Riot 상세](data.md)
- [보안·의존성·미디어·RSO 상세](security.md)
- [신청·회원·관리자 UX 상세](ux.md)
- [실제 브라우저 검증](browser.md)
- [운영 DB·앱 배포 상태](production.md)
- [기능 릴리스 등록 규칙](../../releases/README.md)

최종 현재 트리 검사와 별도 전체 Git 이력 비밀정보 검사도 통과했다. [이력 검사 로그](secrets-history-final.log). 릴리스 97개/tag 97개의 연결을 검증했다. [등록부 검사](release-evidence-final.log). 로그를 보관할 때 끝 공백과 마지막 빈 줄만 정리했으며 테스트 결과는 변경하지 않았다.

## 반영 범위

| 감사 항목 | 최종 변경 | 검증과 한계 |
| --- | --- | --- |
| D1 경기 수정과 MMR 과거 이력 | `0048_mmr-game-source-history`로 세대별 원본 경기 참조를 보존. 새 계산은 당시 입력 snapshot을 저장하고 기존 event는 사실을 확인할 수 있는 참조만 backfill. 경기 수정·삭제·무효화 이후에도 과거 계산 이력 보존. | fresh/0047 upgrade, 구 writer 호환, 제목·KDA·게임 제거·무효화 계약 통과. 기존 event에서 과거 KDA를 추측 복원하지 않음. |
| D2 MMR 대량 저장 | profile/event/source/receipt를 기존 transaction 안에서 제한된 크기로 저장. 각 batch 최대 1,000개, position 최대 5,000행/30,000개 bind parameter. | 합성 410게임·4,100 event 저장, 마지막 batch 강제 실패의 전체 rollback과 재시도 통과. |
| D3 Riot 처리량 | 5분마다 한 호출이 최대 4개 작업을 순차 처리. 20초 admission budget, idle/대기/부분 실패/실패에 중단. | 서명 nonce·재시도 정책과 순차성 단위 검사. 실제 provider 처리량 보장이나 전체 데이터 최신화 완료를 주장하지 않음. |
| UX-01 정원 마감 | 예비 참가를 명시적으로 선택하기 전 제출 차단. 기존 본 참가 수정은 유지. | 합성 UI 흐름 테스트. 서버 정원 검증 유지. |
| UX-02 실패 시 입력 소실 | 시즌·심사·카카오 대기 연결 입력은 실패 시 유지하고, 생성 성공 때만 초기화. | 실패/성공 분기 테스트, 브라우저 관측 근거는 아래 분리. |
| UX-03 동시 수정 | 사용자·관리자 플레이어와 참가 신청의 초안을 보존. 서버 최신값 비교와 유지/버리기 선택 전 revision 수락·재저장 차단. | 사용자/관리자 412 회귀와 실제 브라우저 확인. 새 origin의 최종 production 빌드에서 참가 신청 두 탭의 최신값 비교·초안 유지·저장/취소 차단·유지 후 재저장·버리기를 확인. |
| UX-04 운영 신청 목록 | 최대 100건 단위 페이지, 조건별 총건수, 유형·상태 유지한 이전/다음 이동. API의 잘못된/중복 query는 거부. | operation-form HTTP/DB 계약, 합성 문의 105건 fixture. |
| UX-05/06 가입 안내 | 승인·연결 검토 성공 메시지 유지, 로그인 계속하기, native/custom 필드 유효성 및 첫 오류 안내. | 실제 TSX 동작 테스트. 서버 입력 검증 유지. |
| UX-S1 조회 최신성 | 모집·참가 화면의 조회 시각/수동 갱신, 탭 복귀 시 최소 30초 간격 갱신. | throttle/listener 정리·초안 충돌 테스트. 계속 polling하지 않음. |
| B1 좁은 화면 | 최근 경기 링크와 부모 grid의 최소 너비 보정. | 320/390/1440px에서 clientWidth=scrollWidth 측정. |
| S1 의존성 | sharp 0.35.5 및 호환 전이 의존성 업데이트. | production 감사 0. dev 전용 12 affected entry 잔여. |
| S2/S3 정리 작업 | 일반 미디어 DELETE_PENDING 7일·미참조 여부 재확인, STAGED 24시간 후 새 보관기간 적용. 세션 만료/철회 후 30일 보관. 일일 batch 및 실행 감사. | 실제 ARCHIVED 참조 보호, evidence purpose/잘못된 principal 거부, 삭제 실패·중복 실행, 정리 상한 DB 계약. |
| S4 공개 이미지 | 원본 무결성 검사 후 메타데이터 없는 WebP 파생본, `?v=2`, `no-store`, 변환 동시성/메모리 상한. | 합성 EXIF 제거와 원본 digest 유지, 게시 철회 후 cache 차단. 이전 원본 cache의 소급 purge 미실행. |
| S5 RSO 콜백 | state와 원래 live ACCOUNT session/token hash를 10분 서명 capability에 연결. 콜백 전용 Lax cookie, 일반 cookie Strict 유지. | 잘못된 state/session/account/signature/만료/철회 거부. 실제 provider 활성화·왕복은 미실행. |
| PWA·CI | 고정 정적 경로 온라인 재검증, hash asset cache 유지. cache 저장 실패에도 정상 네트워크 응답 반환. main CI 비밀정보/production 의존성 감사, Dependabot 주간 설정. | cache quota 실패 회귀를 포함한 PWA 검사 5/5 및 현재 트리 비밀정보 검사 통과. 실제 설치 기기의 갱신 확인은 별도. |

## 자동 검사 근거

| 실행 | 현재 저장된 결과 | 근거 |
| --- | --- | --- |
| 최종 통합 `npm run check` | PASS, 종료 코드 0. lint 오류 0/기존 경고 58, 계약 688/688, 단위 1,087 pass/1 skip/0 fail, ERD 일치(112 table/174 FK), 가이드 이미지 68개 및 production build 통과. | [check-final.log](check-final.log). 중간 실행 [check.log](check.log)와 초기 cron 계약 기대값 불일치 [로그](check-initial-cron-contract.log)는 별도 보존. |
| 격리 DB 전체 계약 | 최초 35파일 168개 중 167 pass/1 fail. 실패는 MMR rollback 테스트의 AMENDED fixture 순서 불일치. fixture 수정 후 MMR 두 파일 4/4 재실행 통과. 최초 집계를 전체 성공으로 덮지 않음. | [전체 집계](all-database-contracts.json), [전체 로그](all-database-contracts.log), [최종 MMR 재실행](data.md). |
| 보안·자산·RSO | 집중 검사 34/34, 잘못된 session ID 검사 추가 후 RSO 2/2. | [security.md](security.md) |
| 미디어·인증 정리 DB | 3/3 통과, 일회성 클러스터 종료·경로 정리 확인. | [security.md](security.md) |
| PWA | cache 저장 quota 실패 시 정상 응답을 유지하는 추가 회귀까지 최종 5/5 통과. | [최종 통합 로그](check-final.log), 최초 4개 검사는 [security.md](security.md). |
| 복구 drill | 최종 2/2 통과. 0048 포함 dump/restore, migration replay no-op/실패 rollback, 제한된 maintenance 검증과 클러스터/일회성 경로 정리 통과. | [recovery-final.log](recovery-final.log) |
| 인증 HTTP | PASS, 종료 코드 0. guard·limit·관리자 비밀번호·cookie·role·header·logout·production fixture lockout 통과. | [auth-http-final.log](auth-http-final.log) |
| UX | 집중 검사 42/42와 참가 신청 동시 수정 회귀 3개 추가. | [ux.md](ux.md); 최종 통합 실행 수와 별도로 기록. |
| 데이터/Riot 단위 | 21/21, 타입·변경 파일 lint 통과. | [data.md](data.md) |
| 비밀정보·의존성 | 현재 트리 high-confidence secret scan 통과. production 감사 0, 전체 감사 dev 12. | [security.md](security.md) |

집중 실행 수는 통합 실행에 포함될 수 있으므로 합산해 총 테스트 수로 제시하지 않는다. 기존 감사의 과거 통과 수 역시 이번 결과에 합산하지 않는다.

## 브라우저 근거

검증용 앱은 합성 자료만 가진 loopback 일회성 PostgreSQL/Next 서버를 사용한다. 회원·관리자·가입 검토 플레이어, 정원 10/10 신청, 파티 모집, 문의 105개와 긴 최근 경기명 fixture를 제공한다. 운영 이용자 데이터에 테스트 신청/저장을 만들지 않는다. fixture 재현·종료 절차와 안전 guard는 [UX 상세](ux.md)에 있다.

현재 [responsive.json](responsive.json)은 플레이어 상세에서 320px(client/scroll 305), 390px(375), 1440px(1425)로 가로 넘침이 없는 상태를 기록한다. [320px 화면](player-320-fixed.png)을 함께 보관한다.

실제 브라우저 담당자가 다음 흐름을 확인했다. 스크린샷 하나만으로 전체 전후 동작이나 모든 브라우저 조합의 성공을 판단하지 않는다.

| 시나리오 | 관측 결과 | 화면 근거 |
| --- | --- | --- |
| 사용자 플레이어 동시 수정 | 오래된 revision 저장의 412 이후 초안 유지, 최신값 비교, 입력 유지 선택 후 재저장 확인. | [사용자 충돌](account-conflict.png) |
| 관리자 플레이어 동시 수정 | 412 이후 초안 유지와 최신값 비교, 입력 버리기 확인. | [관리자 충돌](admin-conflict.png) |
| 참가 신청 동시 수정 | 최종 production 빌드를 새 loopback origin에서 실행. 두 탭의 서버 MID/작성 TOP 비교, TOP 초안 유지, 저장·취소 차단, 입력 유지 후 TOP 재저장, 다른 탭의 버리기로 최신 TOP 복구 확인. | [참가 신청 충돌](application-conflict.png), [상세 순서](browser.md) |
| 정원 마감 참가 | 본 참가 10/10에서 예비 참가를 직접 선택한 뒤 11번째 신청이 reserve로 처리됨. | [합성 fixture 실제 UI 제출 기록](browser.md) |
| 운영 신청 페이지 | 유형/PENDING 조건 105건을 100건+5건으로 확인하고 다음 페이지에서 필터 유지. 유형별 URL의 canonical 경로 보정도 반영. | [신청 목록 2페이지](operation-forms-page2.png) |
| 시즌 오류 복구 | 중복 시즌명 서버 거절 뒤 작성 입력 유지. | [시즌 오류 입력](season-failure-input.png) |
| 가입 | native 입력 검증, 성공 결과 유지와 로그인 계속하기 확인. | [가입 결과](signup-complete.png) |
| 좁은 화면 | 실제 320/390/1440px 설정에서 가로 넘침 없음, 화면 검토 통과. | [측정](responsive.json), [320px 화면](player-320-fixed.png) |

참가 신청의 초기 개발 서버 관측은 최종 판정에서 제외했다. 이전 service worker/development chunk cache가 원인일 가능성을 조사했지만 이를 입증한 것은 아니다. 위 판정은 새 origin에서 실행한 최종 production 빌드의 실제 브라우저 결과다. PWA cache quota 실패의 추가 수정도 최종 5/5 회귀와 통합 검사에 포함했다.

## DB 복구 준비와 migration

배포 전 운영 연결을 읽기 전용으로 확인하고 private 경로에 dump를 보관한 뒤 격리 PostgreSQL 18로 복원했다. 공개 기록에는 원본 데이터나 접속값 대신 검증 수치와 digest만 남겼다. 192개 table의 행 수와 논리 column/constraint, MMR 9개 table 내용·상태, migration head가 일치했다. [백업·복원 근거](production-backup-restore.json).

그 복원본에 `0048_mmr-game-source-history`를 적용하고 재실행했다. 기존 MMR 9개 table과 event 1,950개를 보존했고 참조 195개를 `LEGACY_EVENT_REFERENCE`로 생성했다. missing/invalid 0이며 재실행은 no-op이었다. [migration rehearsal](migration-rehearsal.json).

이후 실제 운영 DB에도 검토한 0048을 transaction으로 적용하고 재실행했다. **운영 적용 PASS**: 기존 MMR 9개 table·event 1,950개 보존, legacy source 195개, missing/invalid 0, migration 49개, 재실행 no-op. [운영 적용 JSON](production-migration.json), [대상 확인·잠금·복구 절차](production.md). 앱 배포 후에도 동일 무결성을 [읽기 전용 재확인](postdeploy-db.json)했다.

0048은 전진 migration이며 앱을 이전 버전으로 돌려도 DB에 유지한다. 구 writer 호환 trigger가 과거 앱의 event-only 삽입을 허용한다. live game을 참조하던 이전 FK로 되돌리는 down migration은 지원하지 않는다. 복원 검증은 provider PITR이나 Blob 원본 백업을 포함하지 않는다.

## 배포 후 확인과 남는 제한

- 운영 migration·앱 배포·tag 게시·공개 HTTP 34조건·DB 재확인과 실제 모집 새로고침/플레이어 320·390·1440px 확인을 완료했다. [운영 브라우저](production-browser.json), [배포 기록](production.md).
- 일일 security-maintenance는 `vercel.json`상 19:30 UTC(다음 날 04:30 KST)다. 최대 미디어 20개·세션 1,000개보다 큰 backlog는 여러 날에 걸쳐 처리된다. 성공 후 같은 UTC 날짜의 추가 호출은 새 batch를 시작하지 않는다. 실제 예약 실행과 수량/실패 관찰은 배포 후 근거가 필요하다.
- 개발 의존성 잔여 12개는 moderate 4/high 8/critical 0이며 braces/micromatch/fast-glob 및 drizzle-kit/@esbuild-kit/esbuild 체인에 있다. 운영 의존성 감사 0과 구분한다. 호환성을 검증하지 않은 강제 major override나 downgrade를 적용하지 않았다.
- 실제 Riot RSO 제공자는 새로 활성화하지 않았고 실제 외부 왕복을 검증하지 않았다. 일반 Riot API의 순차 queue 개선과 RSO 로그인 제공자 활성화는 별개의 상태다.
- 이미 다운로드된 공개 원본 회수, 과거 CDN/browser cache purge, 실제 트래픽 변환 부하, 실제 PWA 설치 기기 갱신, 장기 알림 운영/PITR을 이 검사로 완료 처리하지 않는다.
- 카카오 실기기·방과 MMR v2의 사용자 확인 완료 상태는 유지한다. 이번 릴리스가 이 완료 상태를 다시 대기 상태로 바꾸지 않는다.
