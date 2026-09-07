# ADR-S04: 경기·결과 aggregate와 비공개 접수

- 상태: 구현 중, PostgreSQL 18·HTTP·시각 QA와 migration 0005 증거 대기
- 범위: S04 경기/결과, 사용자 접수, 관리자 검토, 비공개 스코어보드
- 비범위: S05 통계/MMR projection, S10 공개 미디어, S13 정리 worker/수리 mutation

## 1. V1 근거와 동등성 결정

V1 `MatchSeries.seasonId`는 필수지만 `InhouseResultSubmission.seasonId`는 nullable이다. 따라서 공개 경기와
승인 시점에는 시즌이 반드시 존재하고 RETIRED가 아니어야 하며, WEB/KAKAO/ADMIN 접수 초안은 시즌 미지정을
허용한다. 관리자는 검토안을 저장하기 전에 시즌을 명시적으로 매핑한다.

WEB 접수는 V1 계약대로 organizer 1~100자, seriesNumber 양의 정수, note 최대 1000자,
expectedGameCount 정확히 2 또는 3, requestId 8~100자, 선택적 teamBalanceDraftId를 갖는다. ADMIN 직접
가져오기는 한 장의 10인 스코어보드를 검토하는 별도 source이므로 expectedGameCount=1을 허용한다.
KAKAO source는 owner가 없고 관리자만 볼 수 있는 S09 확장 seam으로 남긴다. title은 organizer/회차를
대체하지 않는다.

접수가 승인되면 nullable `teamBalanceDraftId`를 `match_series.team_balance_draft_id`에 같은 transaction으로
복사한다. 수동 경기에는 null을 기록하고 일반 경기 교정 API로는 이 provenance를 바꾸거나 지우지 않는다.
S06 team-balance 원장이 생기기 전에는 의도적으로 UUID seam과 조회 index만 두며, 실제 foreign key는 S06
migration에서 기존 값 검증 후 추가한다.

## 2. aggregate와 lifecycle

`match_series -> match_games -> match_participants`를 aggregate 경계로 둔다. UUID가 canonical ID이며,
positive int32 `legacyId`는 nullable unique·일반 관리자 API 불변이다. 승인된 offline import/SUPER migration만
legacy mapping을 부여할 수 있다. 공개 legacy 숫자 URL은 DB 매핑 뒤 same-origin 상대 308로 UUID URL에
연결한다.

`match_participants.nickname_snapshot/tag_line_snapshot`은 경기 기록 transaction에서 `registry.players`를
share-lock한 뒤 서버가 복사하는 필수 표시 이름이다. 공개 상세는 현재 registry 이름이 아니라 이 값을 읽고,
registry는 현재 프로필 활성 여부만 판단한다. 경기 전체 교정도 기존 series에 이미 등장한 playerId의 표시 이름은
보존하며 새로 추가된 참가자만 잠근 현재 registry 값을 캡처한다. 따라서 등록부 이름 변경이나 제목/KDA 교정이
과거 경기의 당시 Riot ID를 소급 변경하지 않고, aggregate version/audit snapshot에도 같은 표시 이름이 남는다.

상태는 `DRAFT -> PUBLISHED -> VOIDED -> PUBLISHED(restore)`이다. hard delete는 제공하지 않는다. 공개 경기의
게임 수, 플레이어, 챔피언, KDA, 시즌과 날짜를 전체 교정할 수 있고 이전/새 snapshot, revision, audit,
receipt, outbox를 한 transaction에 기록한다. VOIDED는 공개/통계에서 제외되지만 원본과 복구 가능성을
보존하므로 V1 DELETE보다 안전한 동등 기능이다.

PUBLISHED/restore 시 각 게임은 다음을 모두 만족해야 한다.

- gameNumber가 1부터 연속이고 series gameCount와 일치한다.
- BLUE/RED 각 5명, TOP/JGL/MID/ADC/SUP 각 1명이다.
- 플레이어 10명과 활성 championKey 10개가 게임 내 고유하다.
- champion catalog 존재/활성 상태를 같은 transaction에서 재검증한다.
- season이 존재하고 RETIRED가 아님을 같은 transaction에서 잠금·재검증한다.

DB constraint/trigger와 동시성 증거는 migration 0005 생성 후 PostgreSQL 18에서 추가 검증한다.

## 3. 시간과 시리즈 결과

`playedOn`은 KST 달력 날짜다. `startedAt`은 선택적 절대 instant이며 원래 offset minutes를 함께 저장한다.
입력 offset으로 복원한 현지 날짜는 playedOn과 같아야 한다. UI 기본 날짜는 UTC ISO slice가 아니라 KST
calendar date를 사용한다. expectedGameCount=2인 시리즈는 1:1이 가능하므로 공개 filter는 BLUE/RED뿐 아니라
TIE(무승부)를 명시한다.

## 4. MVP 단일 공식

버전은 immutable `V1_COMPAT_1`이다. 승리팀만 후보이며 부동소수 오차를 없애기 위해 다음 2배 정수를 저장한다.

```text
scoreUnits2 = kills*6 + assists*3 - deaths*4 + 10
score = scoreUnits2 / 2
```

음수 clamp는 없다. tie-break는 score, kills DESC, deaths ASC, assists DESC, canonical lowercase player UUID의
code-unit ASC다. `localeCompare`는 사용하지 않는다. `mvpPlayerId`, formula version과 selection provenance를
게임 row에 저장하고 공개 DTO에는 registry player UUID만 노출한다.

## 5. S05 outbox 계약

경기 create/publish/amend/void/restore와 `match.changed` outbox를 같은 transaction에 기록한다. event에는
eventId, matchId, matchRevision, old/new seasonId, old/new orderKey, input digest를 typed column으로 둔다.
원 팀 밸런스 draft가 있는 경기에는 immutable `teamBalanceDraftId`도 typed column과 payload에 함께 기록한다.
시즌 A에서 B로 교정할 때 S05가 A 기여 제거와 B 재적용을 모두 수행할 수 있다. DRAFT 변경은 old/new
season/order scope를 null로 둔다. S04 HTTP transaction에서는 통계/MMR를 계산하지 않는다. lease status별
lockedAt/deliveredAt/error 일관성과 retry 회복은 DB check와 S05/S13 worker test로 검증한다.

## 6. 검색·summary·reconciliation

public 목록은 `(playedOn, coalesce(startedAt), id)` 또는 `(titleNormalized,id)` keyset cursor를 쓰고 cursor를
canonical filter fingerprint에 결합한다. total은 cursor가 아닌 base filter로 계산한다. page adapter는 100으로
제한한다. `%`, `_`, `\\`는 literal substring으로 escape한다. match/submission substring은 pg_trgm GIN을
사용하고, migration은 extension availability/권한을 preflight하여 없으면 명확히 실패해야 한다.

`blueWins/redWins/gameCount`는 aggregate write와 같은 transaction에서 갱신되는 bounded summary다. 공개
목록에서 행별 correlated subquery를 사용하지 않는다. ADMIN read-only integrity endpoint는 UUID keyset으로
1~500 series만 검사하고 그 batch의 game만 aggregate한다. repair mutation은 만들지 않았으며 S13에서 SUPER,
typed revision, audit 조건으로 별도 구현한다.

플레이어 picker는 전체 catalog를 행마다 렌더링하지 않는다. 초기 40명, 서버 검색 최대 20명, 현재 선택 ID를
bounded include한다. 검색은 두 글자 이상 normalized prefix 또는 `nickname#tag` composite exact lookup이며,
disabled/inactive 항목은 키보드 이동에서 건너뛴다. 실제 EXPLAIN/DOM 예산 증거는 migration 후 남긴다.

## 7. transaction auth와 idempotency

모든 mutation은 origin, exact query/body, C0/C1/Cf/bidi, `If-Match`, `Idempotency-Key`를 검증한다. keyHash,
requestHash, WEB/KAKAO source reference는 단순 SHA가 아니라 domain/scope 분리 HMAC pepper다. advisory lock
material은 printable JSON이며 NUL을 쓰지 않는다. expired receipt는 auth guard 뒤 lock→delete→replay→insert
순서로 재사용한다.

S01 병합 후 bespoke authorizer를 공통 transaction session lock으로 교체한다. USER action은 ACCOUNT purpose,
APPROVED, !mustChangePassword, minimum USER이며 ADMIN/SUPER 계정도 별도 ACCOUNT cookie로 사용할 수 있다.
ADMIN-purpose cookie만으로 USER action은 금지한다. 관리자 mutation은 ADMIN purpose와 TOTP 정책을 따른다.
account→session→submission/match/reservation 순서로 잠그고 revoke/role/status/TOTP/password race를 검증한다.

관리자 경기 전체 교정에서 412를 받으면 client는 즉시 로컬 form을 버리거나 revision만 추측하지 않는다. canonical
관리자 GET의 전체 aggregate를 no-store로 다시 읽고 UUID·status·revision·시즌·시간·게임/10인 roster를 domain
parser로 검증한다. 검증한 최신 revision으로 parent hero와 editor state를 맞추되 로컬 입력은 유지하고 mutation을
잠근다. 관리자가 ‘로컬 입력을 최신 revision에 재적용’ 또는 ‘서버 전체 불러오기’를 명시적으로 선택해야 두 번째
시도가 가능하다. 최신 projection 조회 실패나 더 새롭지 않은 응답에서는 기존 revision, 입력, 멱등 key를 보존한다.

## 8. 공개/비공개 DTO

public match DTO allowlist는 match/season 공개 식별자와 title/date/score, gameNumber/duration/winner/MVP registry
playerId, 공개 프로필 연결 가능 여부, nickname/tagLine/position/champion display/result만 포함한다. 비활성 플레이어는
현재 profile이 404이므로 링크 대신 보존된 경기 표시명과 ‘비활성 프로필’을 렌더링한다. memberName, userAccountId, balanceOverride,
submission code/note/provenance, asset/storage/OCR reference는 금지한다. exact-key privacy test로 고정한다.

owner DTO는 publicReviewReason만 제공하고 내부 reviewer memo/OCR/source provenance를 주지 않는다. history는
stable cursor로 21번째 이후도 접근한다. publicCode lookup은 strict uppercase owner scope이며 타인/KAKAO/없는
코드는 동일 404다.

`teamBalanceDraftId`는 관리자 경기 DTO와 내부 aggregate/audit/outbox에서만 사용하며 public match DTO에는
노출하지 않는다.

거절 후 검토를 재개하면 live submission의 `publicReviewReason`은 null로 돌아가지만,
`MATCH_SUBMISSION_REJECTED.afterJson`과 `MATCH_SUBMISSION_REOPENED.beforeJson`에는 원래 공개 사유를 포함한다.
이 필드는 재개 transaction의 audit insert가 성공하기 전에는 함께 commit되지 않으므로 사유 이력이 유실되지 않는다.

## 9. private asset/OCR saga

`assets.private_assets.purpose`는 enum이 아닌 bounded varchar라 S11 증거 유형을 migration 없이 확장할 수 있다.
createdByUserAccountId는 nullable이고 ingestSource WEB_USER/ADMIN/KAKAO_SERVICE/JOB와 DB consistency를 갖는다.
WEB/ADMIN은 actor가 필수, service/job은 null이다. public DTO에는 asset row가 절대 나오지 않는다.

업로드 순서는 다음과 같다.

1. session/owner/status/revision/receipt replay 확인과 durable slot reservation
2. 신규 시도만 account+network durable rate limit 소비
3. 정확한 Content-Length body를 total/idle deadline 아래 읽기
4. bounded process work gate 획득
5. SHA/size/content sniffing과 Sharp full decode, dimension/pixel/frame/container-end 검증
6. 사전 결정한 idempotent private storage key에 stage(AbortSignal/deadline)
7. provider-agnostic versioned OCR candidate 생성 또는 FAILED/UNAVAILABLE
8. asset/image/submission status/audit/receipt를 원자 finalize

stage timeout은 late completion 가능성이 있으므로 terminal delete-confirm하지 않고 reservation을 DELETE_PENDING으로
남긴다. S13이 quarantine key를 반복 삭제한다. DB attach 실패도 동일하다. cancellation은 submission을 먼저
잠그고 asset과 RESERVED/STAGED/FINALIZED reservation 전부 DELETE_PENDING으로 전환한다. finalize도
submission→reservation 순서라 cancel/upload 및 cancel/approve 경합이 직렬화된다.

OCR은 자동 publish하지 않는다. team+position exact 후보의 champion/KDA만 seed할 수 있고 nickname은 player에
자동 연결하지 않는다. 중복/미매핑/unknown을 표시하고 10개 행 각각 원본 대조 확인 후 검토안을 저장해야만
approve할 수 있다. production adapter 미설정은 fail-closed, local/test fake만 명시적으로 허용한다.

OCR 재분석도 저장소 read/OCR보다 먼저 별도 durable lease를 만든다. transaction session guard와 receipt replay를
먼저 확인하고 submission→image→asset을 잠근 뒤 exact image revision, review 가능한 submission 상태, READY asset,
동일-key replay, single-image active slot을 검증한다. 기존 동일 예약 replay는 rate quota를 소비하지 않으며 신규
작업만 account durable rate limit을 소비한다. lease는 DB `clock_timestamp()` 기준 60초이고 만료 row는 FAILED로
명시 회수된다. 그 뒤에만 process work gate를 얻고 deadline/AbortSignal이 있는 storage read와 OCR을 실행한다.
OCR timeout/unavailable/invalid output은 private 원본을 공개하지 않고 versioned FAILED 결과로 원자 finalize하며,
receipt·image revision·audit·reservation FINALIZED가 같은 transaction에 기록된다. gate/finalize 실패는 예약을
FAILED로 바꾸고, 이미 commit된 모호 응답에서는 fail 요청이 FINALIZED를 되돌리지 않는다. 동시 lease/timeout/
receipt-expiry race의 최종 증거는 0005 PostgreSQL 18 테스트에서 남긴다.

관리자 직접 import도 동일 submission/private-asset saga를 사용한다. browser recovery에는 UUID, revision,
idempotency key, 2시간 expiry만 sessionStorage에 저장하며 이미지 bytes/base64, OCR, SHA, storage key,
member/account 정보는 저장하지 않는다. storage access 실패는 best-effort/no-throw이고 성공·취소·로그아웃에서
namespace를 지운다.

## 10. 출시 게이트

현재 source/static/unit/webpack compile과 S04 집중 PostgreSQL 18 증거가 있다. 완료 판정 전에 남은 항목은 다음과 같다.

- S01 최종 SHA rebase와 공통 transaction auth 적용
- PostgreSQL 18 cancel/upload/OCR lease, receipt expiry, old/new contribution 동시성 race
- canonical/legacy HTTP origin·headers·DTO tests
- 1440/390/375/320 ready/empty/error/permission/mutation browser captures와 metrics
- main worktree normal Turbopack build (현재 독립 worktree node_modules junction 제한은 별도 환경 증거)

완료된 PostgreSQL 범위는 `0004` upgrade/idempotency와 기존 player 보존, `pg_trgm` preflight·GIN
`EXPLAIN`, snapshot rename/교정, reject/reopen audit, `teamBalanceDraftId` 전달, V1 MVP tie-break 저장 결과,
stored/game summary 정상·불일치 reconciliation이다.
