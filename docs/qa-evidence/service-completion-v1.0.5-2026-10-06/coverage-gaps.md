# 18개 기능군의 검증 공백 재분류 — 1.0.5

분석 기준은 `ca242292ef82d9910574925465d898e8e0e79887`(운영 1.0.4)이며 현재 통합 수정은 별도다. [이전 원장](../service-completion-v1.0.4-2026-10-06/ordered-review.md)의 ‘이번 브라우저에서 미실행’을 외부 권한이 필요한 차단 사항으로 취급하지 않는다. 실제 페이지/API 목록, `scripts/test-db/run-data-contracts.ts`의 실행 파일 목록, 개별 테스트의 assertion과 실제 브라우저 기록을 다시 대조했다.

**증거의 층위:** 소스 구조·계약 assertion, 실제 컴포넌트 handler 실행, 격리 PostgreSQL 저장/트랜잭션, 최적화 Next 서버 HTTP, 실제 브라우저 조작, 운영 제공자/실기기를 구분한다. 어느 하나를 다른 층위의 통과로 확대하지 않는다. 과거 결과는 과거 버전의 근거이며 현재 수정의 회귀와 구분한다.

[현재 소스 원장 대조](inventory-reconciliation.json): 실제 파일을 다시 탐색해 108페이지·212개 API·63개 호환 handler·3개 metadata, 총 386경로를 확인했다. 추가/삭제·route template·명시적 HTTP method·6개 cron 설정의 드리프트는 없다. 달라진 page source 5개는 초안 복귀/문의 처리 화면 수정이며 새 기능 경로가 아니다. 이 구조 대조를 모든 조작의 실행 완료로 표시하지 않는다.

## 이번에 직접 닫은 HTTP 쓰기 공백

새 실행기 [`verify-admin-service-write-http.ts`](../../../scripts/test-db/verify-admin-service-write-http.ts)는 기존 root 관리 합성 fixture만 사용한다. 명시적 test mode, `.tmp` 내부 ready 파일, loopback URL, 생성된 관리자 이름 패턴과 UUID, 로그인 후 정확한 합성 계정 일치를 확인한다. 새 서버/DB를 만들지 않고 자신이 생성한 엔티티만 수정한다. 실회원·운영 자산·외부 메시지와 root의 기존 신청/팀 fixture는 변경하지 않는다. 각 요청의 응답 상태·revision·replay와 저장 후 재조회 결과를 확인한다. 결과에는 원문 문의·세션·비밀번호를 기록하지 않는다.

| 흐름 | 실제 실행과 결과 | 근거/경계 |
|---|---|---|
| 문의 접수→운영 검토→삭제 | **HTTP PASS.** 잘못된 origin/동의 거부, 동일 요청 동시 생성 1회+원래 receipt 재생, 다른 본문 같은 키 409, 미인증 조회 401, 동시 검토 200/412, 승자 내용 재조회, 검토/삭제 replay, 삭제 후 404. 별도 실제 UI에서 ETag 오류를 발견·수정했으며 UI 저장 재확인은 미완료 | [원본 결과](admin-service-write-before.json) `support-to-admin-review` 14응답. 정상 숫자 ETag를 직접 보내는 이 검사는 실제 UI의 잘못된 `rev-0` 헤더를 탐지하지 못했다. [UI 원인/회귀](operation-form-flow.md), [실제 브라우저 경계](browser.md)와 함께 판정 |
| 이벤트 생성→수정→취소→복구 | **수정 후 PASS.** 원래 같은 본문·키의 동시 POST가 201/503으로 갈라졌으나 새 빌드에서는 두 응답 모두 201이고 원래 receipt가 정확히 1회 replay됨. 다른 본문 같은 키 409, 다른 키의 동시 수정 200/412, 승자 내용 재조회, 취소 replay·복구·최종 취소 확인 | [원본 실패](admin-service-write-before.json) → [새 빌드 11응답](event-write-http-after.json). [unit 수정 전](event-transaction-retry-before.log) 1 PASS/2 FAIL → [수정 후](event-transaction-retry-after.log) 3 PASS. DB 오류 40001/40P01만 최대 3회 새 트랜잭션 재시도; [fresh DB](completion-browser-final-database.log)의 S07 확장 회귀도 통과 |
| 멸망전 생성→일정→취소→복구 | PASS. 동일 생성 replay, 같은 revision의 서로 다른 일정 200/412, 승자 재조회, 취소 replay, ADMIN 복구 403/SUPER 복구 성공, 최종 취소 | [원본 결과](admin-service-write-before.json) `destruction-create-schedule-cancel-restore` 10응답. 경매 전체 UI가 아닌 관리 HTTP 흐름 |
| 하이라이트 저장→공개→보관 | PASS. 동일 생성 replay, 비공개 상태 404, 동시 수정 200/412, 승자 저장 조회, 공개 200, 보관 replay, 공개 404와 관리자 ARCHIVED 보존 | [원본 결과](admin-service-write-before.json) `highlight-save-publish-archive` 12응답 |
| 갤러리 저장→이미지→공개→보관 | PASS. 빈 갤러리 공개 409, 합성 PNG 업로드→asset 연결, 공개 시 해당 asset 포함, 오래된 revision 보관 412, 보관 후 공개 404/관리자 ARCHIVED | [실행 결과](gallery-write-http-after-harness-correction.json) 10응답. 최초 실행기가 정당한 409를 400으로 기대한 오류를 정정했으며 제품 변경은 하지 않음. `V2_FAKE_PRIVATE_ASSETS=1`로 실제 Blob 왕복과 구분 |
| 징계 생성→수정→취소 | PASS. 실제 회원과 연결하지 않은 합성 CAUTION, 동일 생성 replay, 미인증 401/일반 ADMIN 수정 403, SUPER 동시 수정 200/412, 승자 내용 재조회, 취소 replay와 active=false 보존 | [원본 결과](admin-service-write-before.json) `discipline-create-update-cancel` 10응답. 실제 회원 제한/과제 추가 없이 검증 |

기존 `operation-forms.contract.test.ts`의 동시 접수·보존 정리, `destruction-competition.contract.test.ts`의 동시 경매/취소 복구, 미디어/징계의 저장 테스트는 이미 존재했다. 이 검사들의 복제 대신 실제 인증·라우팅·HTTP 헤더·ETag·409/412 매핑까지 연결된 위 경로를 추가했다. `run-ux-http-qa.ts`는 별도 서버를 시작하는 실행기이며 전체 DB harness에 자동 포함되어 있지 않으므로 이전 로그만으로 이 경로가 이번에 통과했다고 판단하지 않았다.

## 기능군별 남은 실행과 조건

`로컬 가능`은 외부 소유권/새 비용 없이 현 합성 환경에서 진행할 수 있다는 뜻이며, 완료 주장이 아니다. `외부 조건`은 구체적인 실제 기기/계정/수신자/제공자 접근이 필요하다. 브라우저별 모든 조합이나 미래의 무장애를 보장한다는 기준은 사용하지 않는다.

| 순서/기능군 | 현재 확인된 층위와 의미 | 로컬에서 닫을 수 있는 남은 경계 | 실제 외부 조건 |
|---|---|---|---|
| 01 홈·탐색 | 이전 실제 브라우저: 6영역 순서, 검색/Escape 복귀, 단일 랭킹 직접 선택, 4개 viewport. 이번 운영 320px 검색에 공백 없는 영문 80자를 넣었고 해당 링크 넘침은 재현되지 않음 | 현재 대비 수정의 수치·회귀는 [시각 검토](visual-review.md). 이번 스타일 변경 후 대표 화면의 실제 렌더 확인과 기존 확인 범위를 구분 | 실 스크린리더, 대상 휴대폰/OS, 신규 이용자 관찰은 CSS viewport·unit과 다름 |
| 02 계정·인증 | 계정·TOTP·세션 DB 및 auth/account HTTP가 기존 harness에 있음. 새 빌드 실제 합성 로그인 후 유효 초안의 `tab=recommendations&team=RED` 복귀와 선택 보존 확인 | 잘못된 `tab=manual`을 사용한 검증자 입력은 제품 실패에서 제외. 관리자 문의 상세의 로그인 next는 도달했으나 도구 입력 제한 때문에 제출 완료 미확인 | 실제 운영진의 비밀번호 복구 승인/전달·외부 계정 소유권은 합성 로그인과 다름 |
| 03 내전 참가 | DB 계약은 소유권·명단·마감/회차·중복 저장 검사. 이전 브라우저 본참가→예비/포지션 변경 저장 | 이번 실제 `내 신청 취소` 클릭에서 native confirm 이후 도구가 응답하지 않았고 새 탭은 신청1을 유지함. **취소 완료 미확인**. 로컬 도구/확인창 해소 후 취소→재신청 확인 가능하며 외부 계정 권한 제약으로 분류하지 않음 | 카카오 실제 방 명단/동명 연결과 수신은 해당 방 운영 조건 |
| 04 파티 모집 | 기존 recruiting/Kakao 스냅샷 DB 계약, 이전 실제 클립보드 `구인상세 1` 쓰기 확인 | 만원/예비/종료/빈 목록·검색 복구는 합성 상태로 재현 가능. 외부 송신을 복사 성공으로 주장하지 않음 | 지정된 방·기기에서 명령 전송→봇 저장→조회 수신 |
| 05 이벤트전 | 기존 도메인/DB는 10명·팀 편성·대진·결과 교정·소유자 신청. 이번에 발견한 저장 경쟁 결함을 수정하고 새 DB/HTTP PASS | [새 DB](completion-browser-final-database.log): 동일 생성 1 commit+replay, 다른 키 동일 revision 1 commit+REVISION_CONFLICT, receipt/audit/outbox 정확히 2건. [새 HTTP](event-write-http-after.json): 생성→수정→취소→복구 PASS. 생성 폼의 실제 브라우저 복구/이동은 root 별도 관측 | 실제 대회/실제 참가자 변경은 시험 목적상 불필요. 현장 종료까지 사용자 행동은 별도 운영 관찰 |
| 06 멸망전 | 기존 DB 경매/일정/동시성/취소복구, 이번 실제 관리 HTTP 저장/충돌/복구 PASS | 합성 경매 입력/수정/취소 UI의 대표 과업은 로컬에서 확인 가능. 전체 장시간 동접 부하/모든 대진 조합을 기존 PASS로 확대하지 않음 | 실제 라이브 수집/현장 참가자·장시간 운영 관찰은 합성 경매와 다름 |
| 07 실력별 팀 만들기 | 이번 [실제 브라우저](browser.md): 기준 빌드에서 10명 추가→추천→저장→새로고침→접수 폼 연결. 새 빌드에서는 직접 교체→미평가 행동 잠금→되돌리기→다시 평가/선택→실제 clipboard 일치→저장→새로고침 후 선수 배치 유지 | 새 빌드의 접수 링크가 올바른 draftId로 이동한 것은 확인했으나 로딩 종료 전 다른 과업으로 이동해 해당 접수 폼의 팀 표시까지 완료로 적지 않음. 이전 폼 연결 확인과 구분 | 실제 참가자에게 팀을 배포하거나 실경기 생성할 필요 없음 |
| 08 무작위 팀·진영 | 이전 실제 10명→5:5→초기화. 도메인 동명/슬롯/티어/결정성과 모션 상태 회귀 | 변경된 크기/문구의 포커스와 긴 입력, 브라우저 reduced-motion emulation은 로컬 가능 | iOS/Android 영상 재생·OS 실제 설정 변경은 실기기 필요 |
| 09 경기 기록·제출 | 기존 경기/권한 DB, 실제 합성 생성→두 이미지→검토 대기. 이전 생성 후 navigation 잠금 handler 회귀 | 합성 검토/반려/수정/취소/재개 및 잘못된 코드/로그인 복귀는 로컬에서 추가 확인 가능. 기존 DB/handler와 실제 UI를 구분 | 원본 자료의 OCR 정확도, 실제 승인 업무, provider 시간 초과·실파일 수명은 별도 측정/관찰 |
| 10 플레이어 | 기존 player-admin DB/HTTP와 공개 privacy DTO. 이번 실제 합성 S06 선수의 닉네임을 입력 한도인 W 16자로 저장해 표시와 revision1 반영 확인 | 당시 기본 시즌은 집계 대기여서 이 선수 수정만으로 긴 이름 랭킹 표시까지 통과한 것으로 세지 않음. 필터/페이지 끝·오류 복구는 기존 경계와 현재 변경 범위를 구분 | 실제 Riot 요약의 소유권/공급자 완전성은 15번 |
| 11 랭킹·MMR | 기존 statistics/MMR DB·집계/동률/페이지 회귀. 이번 합성 READY 시즌의 320px에서 W16 이름 scrollWidth240/link137과 성적 겹침을 실제 재현해 줄바꿈 CSS 수정 | 최종 CSS까지 [check-final.log](check-final.log) 통과. 마지막 fresh fixture의 [네 폭 실제 측정](ranking-layout-after.json)에서 이름·수치 겹침과 가로 넘침 없음, 상위 카드의 전체 이름 표시 확인. 운영 공식 전환 대기를 화면 정상처럼 숨기지 않음 | 운영 공식 전환은 기존 SUPER 인증, 전후 점수 영향 검토와 감사 있는 실제 운영 작업. 공개 테스트를 위해 우회할 수 없음 |
| 12 커뮤니티 미디어 | 이번 HTTP로 하이라이트/갤러리 저장·공개·보관·동시 수정까지 PASS, 기존 미디어/private asset DB | 편집 UI의 부분 업로드 실패/다시 시도/취소와 목록 갱신은 합성 fake storage에서 가능. 실제 Blob과 별도로 표시 | 실제 Blob UUID probe는 아래 기존 시점 근거 있음. 임의 사용자 자산에 대한 테스트는 불필요 |
| 13 징계·과제 | 기존 discipline DB: 증빙·다른 소유자 자산 거부·승인·공개 마스킹. 이번 HTTP 생성/동시 수정/취소 PASS | 합성 CAUTION 편집 UI와 과제 증빙 회복 흐름은 로컬 가능. 실제 회원 징계/경고를 만들 필요 없음 | 실제 운영 심사 판단 자체는 제품 자동 테스트의 대상이 아님 |
| 14 문의·운영 신청 | 실제 폼 입력/동의→receipt 표시→같은 번호 관리자 내용 조회 확인. 관리 UI 저장 시 `rev-0` ETag 오류 재현, 실제 서버 파서와 연결된 handler 회귀로 수정. 별도 관리 HTTP는 저장/충돌/삭제 PASS | 수정 후 실제 UI는 관리자 로그인 next·입력까지 진행했으나 native confirm 뒤 도구 입력 제한으로 저장/처리 완료 미확인. 로컬 실행 공백이며 외부 발송 권한 부족이 아님. [UI 수정](operation-form-flow.md)과 HTTP 완료를 구분 | 카카오 기기에서 실제 명령·방/발신자 권한·수신 확인은 16번 |
| 15 Riot 연결 | 기존 riot DB/가짜 provider 실패·권한 경계. 과거 운영 status-v4 200와 실제 summary 갱신 관측은 아래 별도 시점 근거 | fake provider 응답 지연/429/부분 자료/연결 해제 UI·재시도는 로컬 가능. fake를 신규 RSO 소유권 확인으로 표시하지 않음 | RSO 승인 client/callback/state 설정과 동의할 계정 소유자의 OAuth 진행. production key 등급은 status200만으로 입증 불가 |
| 16 카카오 연동 | 서명/nonce·room/installation scope·멱등/ACK와 DB/outbox 계약. 이전 실제 명령 복사까지만 브라우저 확인 | 서버 경계의 합성 서명 거부/재시도/중복 ACK 검증은 기존 계약. 추가 코드 변경 없는 동일 테스트를 반복해 수신 확인으로 바꾸지 않음 | 실제 MessengerBot R 기기·정해진 방·설치본·직접 등록·허용된 시험 메시지/수신자 및 잠금/재시작 관찰 |
| 17 운영·백그라운드 | 기존 operations/health/storage/cleanup DB와 PostgreSQL 논리 복원. 과거 제공자 cron HTTP와 업무 결과 대조는 별도 시점 근거 | 이번 source check/새 DB 계약/HTTP/배포 READY/후속 읽기 확인은 root 통합. 빈 큐·권한·재시도/보존은 합성 DB에서 확인 가능 | 실제 경보 수신 채널 및 시험 대상, 제공자 PITR 권한/별도 복원지·비용/중단 범위. 현재 스케줄러 발신자·장기 무장애는 한 번의 HTTP200으로 증명 불가 |
| 18 도움말·정책·설치 | 실제 설치 handler 거절/중복/뒤늦은 응답 회귀, 정책 본문·consent·404 경계, 이전 모바일 조회 | 현재 버튼/정책 링크/404 복구는 로컬·운영 read-only로 가능. 데스크톱 지원 브라우저의 실제 설치는 해당 기능이 노출될 때 별도 관측 | iOS Safari/Android Chrome 실제 설치 메뉴·appinstalled·홈 화면 실행 및 실 스크린리더 |

## 외부 근거의 재사용 한계

[2026-10-06 08:40~08:45 KST 실제 외부 점검](../service-followup-2026-10-06/external-runtime.md)은 운영 Blob 새 UUID 생성→읽기→해시→삭제/부재, Riot 고정 status-v4, 예약 작업 로그의 구체적 범위를 보유한다. 이번 미디어 fake storage나 합성 HTTP를 그 제공자 검사로 세지 않으며, 과거 관측을 현재 시점에 다시 수행했다고 적지 않는다. 당시 MMR 미소비 **변경 이벤트** 13건은 서로 다른 경기 13개와 다르다.

## 수정과 통합 확인

- 이벤트 서버는 권한/receipt/revision 순서를 바꾸거나 serializable 격리를 낮추지 않았다. 이미 멸망전에서 쓰는 제한된 재시도 정책을 해당 adapter에 적용했다. 테스트용 새 인증·새 API·스키마·migration·운영 데이터 변경은 없다.
- 원본 HTTP의 서버 503과 재시도 unit의 수정 전 실패를 보존했다. 2026-10-06 10:57 KST 새 PostgreSQL fixture/최적화 서버에서 [이벤트 HTTP](event-write-http-after.json) 11응답 PASS(exit 0), [fresh DB](completion-browser-final-database.log)의 확장된 S07 계약 PASS를 확인했다. 새 fixture에서 만든 이벤트 한 건만 수정했으며 기존 합성 신청/팀 데이터는 변경하지 않았다.
- 이어서 [전체 페이지 HTTP](release-http.json)를 순차 실행해 108페이지·169조건, 실패 0(exit 0)을 확인했다. 이는 응답/권한별 redirect/필터/서버 오류 여부 검사이며 모든 버튼 조작이나 실제 브라우저 hydration 검사가 아니다. 제공자/운영 배포 완료와도 구분한다. 당시 DB harness는 실제 브라우저 검증을 위해 hold 중이므로 종료·cleanup 완료는 root의 후속 기록을 따른다.
- 위 60301 fixture는 후속 `stop` 뒤 exit 0·cluster 중지·일회성 경로 정리까지 [DB 로그](completion-browser-final-database.log)와 [브라우저 기록](browser.md)에서 확인했다. 랭킹 CSS 후속 변경을 포함한 [최종 필수 check](check-final.log)는 계약 556 PASS, 단위 1,050 PASS/조건부 skip 1, 오류 0이다. 이어지는 새 release fixture는 해당 CSS의 실제 표시 재확인 목적이며 이전 DB·HTTP PASS를 검증 숫자에 다시 더하지 않는다.
- [중간 typecheck](integration-typecheck-interim.log) exit 0, [트랜잭션 unit](event-transaction-retry-after.log) 3 PASS, 관련 4파일 ESLint exit 0. 이것은 통합 필수 check/배포 완료를 뜻하지 않는다.
- 새 실행기의 optional 네 번째 인자는 위 여섯 그룹 중 이름을 선택한다. 기존 PASS를 의미 없이 반복하거나 문의 rate limit을 소모하지 않기 위해 실패/변경 그룹만 다시 실행할 수 있다. 모든 엔티티는 부모 disposable DB 종료 시 제거되며 운영에는 생성되지 않는다.
- 긴 이름의 실제 랭킹 렌더를 위해 `prepare-ranking-capture-fixture.ts`를 browser-hold/service-QA 경계에 추가했다. 새 ENDED 시즌과 새 플레이어 2명만 생성하며 ACTIVE 기본 시즌·기존 기록을 변경하지 않는다. 실제 관리자 입력 parser를 통과하는 영문 W 16자/한글 16자, 5자 태그·100자 회원명과 READY 표시용 projection을 사용한다. ready의 `fixtures.sourceIds.rankingSeasonId`를 `/rankings?seasonId=<id>&minParticipation=0`에 넣는다. 합성 표시 자료이며 실제 경기 집계 검증 자료가 아니다. 이 자료로 실제 겹침을 재현했으며 후속 CSS의 실제 해소 여부는 최종 브라우저 관측으로 별도 확인한다.

## 남은 로컬 브라우저 제한

[최신 실제 기록](browser.md)의 native `window.confirm` 뒤 도구 tab 입력/상태/닫기 명령이 시간 초과됐다. 사용자에게 확인창 또는 검증 탭을 닫아 달라는 요청이 대기 중이다. 새로운 탭에서도 일부 입력이 진행되지 않은 관측이며, 이를 실제 취소 성공이나 제품의 영구 결함, 외부 계정 소유권/실기기 미보유로 바꾸어 기록하지 않는다. 신청 취소와 문의 관리자 저장의 실제 UI 종료 상태는 미완료로 유지한다. 서버 DB/HTTP/handler 검증은 독립적으로 완료되어도 이 두 UI 완료를 대신하지 않는다.
