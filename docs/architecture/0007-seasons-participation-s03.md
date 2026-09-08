# 0007 — S03 시즌 수명주기와 참가 신청 aggregate

상태: SITE와 Kakao ingest 로컬 구현·격리 검증 완료, 운영 이관은 미완료

## 배경

V1은 시즌 CRUD와 사이트 참가 신청, Kakao 참가 명단을 여러 사용자·관리자 경로에서 다뤘다.
V2에서는 한 개의 활성 시즌, 같은 사람의 같은 날짜·회차 중복 방지, 본인 소유권, 관리자 검토,
동시 수정과 감사 기록을 하나의 PostgreSQL aggregate 계약으로 묶어야 한다.

## 데이터 결정

1. `competition.seasons`의 상태는 `DRAFT`, `ACTIVE`, `ENDED`, `RETIRED`다. 허용 전이는
   `DRAFT → ACTIVE → ENDED`와 참가 이력이 없는 `DRAFT → RETIRED`다. partial unique index로
   `ACTIVE`는 전체 DB에 하나만 허용한다. `RETIRED`는 활성화·종료 이력이 없는 draft 보관이므로
   `retired_at`만 있고 `activated_at`·`ended_at`는 없는 정확한 timestamp 조합을 DB가 강제한다.
2. 시즌과 신청은 UUID primary key를 유지하고, 승인된 V1 import에만 쓰는 nullable positive unique
   `legacy_id`를 둔다. 운영 ID를 추정하거나 자동 발급하지 않는다.
3. 참가 신청 identity는 `season_id + player_id + apply_date + recruit_no`다. SITE와 KAKAO source가
   달라도 같은 사람·날짜·회차는 한 행을 공유한다. KAKAO 행은 32-byte snapshot hash를 요구하지만
   한 snapshot이 여러 참가자를 담을 수 있으므로 hash 자체는 전역 unique가 아니다.
4. 신청 상태는 `APPLIED`, `CONFIRMED`, `RESERVE`, `REJECTED`, `CANCELLED`다. 사용자 취소는 V1
   동등성과 확정 상태 보호를 위해 `APPLIED`에서만 허용한다. `CANCELLED`는 같은 identity upsert로
   다시 `APPLIED`가 될 수 있지만, 검토가 끝난 `CONFIRMED/RESERVE/REJECTED`는 사용자가 되돌릴 수 없다.
5. 주라인 `ALL`은 부라인을 가질 수 없고, 구체 주라인은 `ALL`, 자기 자신, 중복 부라인을 가질 수
   없다. service와 DB check가 같은 불변식을 적용한다.
6. 검토 완료 상태는 review note, reviewer, reviewed timestamp의 일관성을 DB check로 강제한다.
   reviewer 삭제는 `ON DELETE RESTRICT`로 감사 역사를 보존한다. 관리자는 운영상 잘못 분류한
   결정을 바로잡을 수 있도록 `CONFIRMED`, `RESERVE`, `REJECTED` 사이에서 strong revision을
   전제로 재검토할 수 있다. 사용자 수정·취소 잠금과 관리자 재검토 권한은 별개다.
7. 물리 삭제 대신 종료·보관을 사용한다. 참가 이력이 있거나 종료된 시즌 삭제 요청은 409로
   거부하여 과거 신청과 감사 기록을 보존한다.
8. SITE와 Kakao가 같은 identity에 도달하면 `SITE_AND_REVIEWED_DECISIONS_WIN` 정책을 적용한다.
   SITE에서 만든 신청과 `CONFIRMED/RESERVE/REJECTED` 관리자 결정을 Kakao 입력으로 덮어쓰지 않는다.
   아직 검토하지 않은 Kakao 신청과 취소된 Kakao 신청만 새 snapshot 값으로 갱신할 수 있다.

## 서비스·HTTP 결정

- 공개 canonical API는 `/api/seasons`, `/api/seasons/current`,
  `/api/applications/available`, `/api/applications/season`이다. query를 쓰지 않는 canonical route는
  어떤 query key도 400으로 거부한다.
- 관리자 API는 `/api/admin/seasons/**`, `/api/admin/season-applications/**`,
  `/api/admin/season-kakao-pending/**`다. 일반 시즌 검토는 ADMIN/SUPER가 변경할 수 있지만 Kakao
  보류 신청의 수동 player 연결·취소는 SUPER_ADMIN+TOTP만 가능하다. ADMIN은 보류 목록과 상세를
  읽을 수 있고 익명·USER는 401/403으로 분리한다.
- mutation은 exact same-origin, 8 KiB strict JSON allowlist, bidi/control 문자 차단,
  `Idempotency-Key`, strong `If-Match: "revision"`을 요구한다. stale은 412, 중복·잘못된 전이는
  409, 없음은 404다.
- 관리자 `datetime-local`은 client에서 명시적 `+09:00` instant로 바꾸고, server는 timezone이
  명시된 ISO만 받는다. SSR 표시는 항상 `Asia/Seoul`이다.
- 관리자 시즌 `PATCH`는 부분 갱신이 아니라 편집 화면의 완전한 schedule 표현이다. `name`과
  `applicationsOpenAt`, `applicationsCloseAt`, `startsAt`, `endsAt` 5개 key를 모두 요구하며,
  날짜 key의 명시적 `null`만 해당 값을 지운다. key 누락은 400이고 기존 DB·감사 상태는 유지된다.
- application POST/DELETE는 PostgreSQL bucket으로 global, Vercel 신뢰 IP, account, session을
  각각 12회/600초 제한한다. 저장소 장애는 제한을 우회하지 않고 503으로 fail-close한다.
- 성공 변경, revision, 업무 필드 before/after audit, idempotency receipt를 한 transaction으로
  커밋한다. receipt는 원문 key를 저장하지 않고 24시간 후 만료하며 mutation 때 만료행을 정리한다.
- 공개 projection에는 nickname, Riot ID, 라인·상태만 포함한다. 회원명, login ID, Discord,
  review note, reviewer와 내부 provenance는 공개 DTO에 포함하지 않는다.
- `/participation`과 `/participation/season`은 GET/HEAD만 allowlist query를 보존해 canonical 308로
  이동한다. mutation redirect는 제공하지 않는다.

## 읽기 모델·UI 결정

- `/applications`는 활성 시즌 없음/있음, ANONYMOUS/RESTRICTED/APPROVED, active player 연결,
  내 신청과 참가자 상태를 DB에서 다시 계산한다. 참가자는 200행 projection과 전체 상태별 DB
  aggregate를 분리해 201명 이상에서도 count가 정확하고 truncation을 명시한다.
- `/admin/seasons`는 생성, 편집, 복제, 활성화, 종료, 안전한 보관과 신청 filter/page/review를 한
  workspace에서 제공한다. 모바일은 신청별 카드와 직접 보이는 검토 action을 사용하고 1440 표도
  검토 열을 포함해 내부 가로 overflow가 없다.
- `/applications?type=season&recruitNo=N`은 오늘 실제 SITE/Kakao 신청 또는 Kakao 보류 행으로 시작된
  회차만 선택지로 노출한다. 1회차는 항상 열려 있고 2~999회차는 Kakao가 먼저 만든 회차에 한해
  사이트 신청을 허용하므로 임의 회차 생성은 거부한다. 공개 projection은 pending 이름·Riot ID를
  포함하지 않는다.
- `/admin/seasons/kakao-pending`은 보류 목록·필터·상세 player picker를 제공한다. 해결 시 일반 신청
  identity로 병합하고 `If-Match`, 멱등 영수증, transaction 내부 SUPER/TOTP 재검사와 before/after
  감사를 함께 커밋한다. 확정 신청은 내부 `ConfirmedSeasonTeamBalanceRoster` allowlist DTO로만
  team-balance application에 전달하며 회원명·로그인 ID·Kakao provenance를 노출하지 않는다.

## 통합 전 필수 경계

현재 사용자 신청 transaction은 account status/deletedAt과 active player를 다시 잠그지만, route
권한 검사 뒤 admin session revoke/role/status/TOTP가 바뀌는 공통 TOCTOU는 S01의 session-purpose
transaction guard를 S02/S03에 retrofit한 뒤 최종 GO를 판정해야 한다. 이 보강 전 push·운영 이관은
금지한다.

## 명시적 미완료

- S01: 제한 세션의 실제 계정 수명주기 연결과 위 공통 transaction guard 통합
- S13: mutation이 전혀 없는 환경의 receipt 주기 cleanup과 보존량 모니터링
- 운영 V1 legacy ID/source backfill, count/hash/invariant 대조와 복구 리허설

S09는 signed raw-body HMAC, timestamp·nonce·room·sender 검증 뒤 구조화된 snapshot을 수신한다.
Riot ID 또는 정규화된 이름으로 정확히 한 명만 일치할 때 참가 신청에 반영하고, 예비·미일치·동명이인은
검토 가능한 pending 행으로 보존한다. 같은 날짜·회차의 이전 Kakao snapshot에서 빠진 항목은 물리 삭제하지
않고 `CANCELLED`로 수렴한다. 이 로컬 계약은 운영 자격 증명 설정이나 V1 데이터 이관 완료를 뜻하지 않는다.
