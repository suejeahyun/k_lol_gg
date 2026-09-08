# K-LOL.GG V2 통합 개선 실행 계획

- 작성 기준일: 2026-09-08 KST
- 기준 커밋: `38edbfd5681c486484855a2fbc039968304bb06c`
- 기준 브랜치: `main` = `origin/main`
- 운영 주소: `https://k-lol-gg.vercel.app`
- 목적: 이미 구현된 기능을 다시 만드는 것이 아니라, 실제 운영 데이터·외부 연동·관리자 권한·화면 디테일까지 연결해 **알려진 중요 결함과 미검증 핵심 흐름을 0으로 만드는 것**

## 1. 현재 상태 요약

### 확인됨

| 항목 | 현재 근거 |
| --- | --- |
| 소스·배포 | GitHub와 Vercel 모두 `38edbfd5` 배포 성공 |
| CI | GitHub `check` job 성공 |
| 코드 규모 | `page.tsx` 102개, Route Handler 257개, migration 26개 |
| 로컬 검증 | ESLint, TypeScript, 정적 계약 130/130, 단위 테스트 458/458, production build 통과 |
| DB 계약 | 26개 migration, 96개 테이블, 핵심 DB 계약과 복구 검사 통과 |
| 공개 운영 smoke | health, 챔피언, 랭킹, 플레이어, 시즌 신청, 팀 밸런스가 HTTP 200 |
| 기존 DB 연결 | 운영 통계 API에서 V1 시즌명과 경기 42·게임 91·참가행 910 집계 확인 |
| 관리자 보호 | 익명 `/admin/**` 접근이 관리자 로그인으로 이동하고 API는 401을 반환 |

### 확인된 결함 또는 공백

| 우선순위 | 항목 | 현재 증거 | 필요한 결과 |
| --- | --- | --- | --- |
| P0 | 운영 공개 URL 설정 | 운영 HTML의 OG 이미지가 `http://localhost:3000/og.png`로 생성 | 모든 metadata·callback·same-origin 기준을 운영 HTTPS 주소로 통일 |
| P0 | 챔피언 이미지 | 운영 `/api/champions` 30개가 모두 `imageUrl:null` | 현행 챔피언 전체 카탈로그와 이미지가 유효한 Data Dragon URL을 보유 |
| P0 | 이미지 migration 한계 | `0025`는 열·제약만 추가하고 backfill 없음 | 멱등 repair와 전후 대조를 별도 구현 |
| P0 | Riot 이관 전적 비노출 | 이관 링크는 `DISCONNECTED`, 공개 쿼리는 `CONNECTED`만 읽음 | 과거 snapshot과 현재 연결 상태를 분리해 표시 |
| P1 | 플레이어 목록 허위 빈 상태 | 카드용 포지션·최근 경기·승률 projection이 항상 `null` | 실제 값을 연결하거나 근거 없는 항목을 제거 |
| P1 | 최신 관리자·모바일 검수 | 기존 326장과 최근 15장은 최신 커밋 이전 | 최신 102페이지·상태별 캡처와 오류 수집 |
| P1 | 실제 관리자 권한 검증 | 익명 경계만 운영 확인 | ACCOUNT·ADMIN·SUPER_ADMIN 실제 200/403 매트릭스 확보 |
| P1 | Kakao V41 운영 | 소스와 로컬 계약만 존재 | 별도 봇 사본 검증 후 실제 V41 전환 |
| P1 | Blob·Riot·scheduler | route와 adapter는 있으나 실제 성공 증거 없음 | 최소 성공·실패 UAT와 감사·재시도 증거 확보 |
| P2 | 가독성 | CSS에 9~11px 또는 0.6~0.74rem 후보 규칙이 203곳 | 정보 중요도에 맞춘 최소 글자 크기와 행간 기준 적용 |
| P2 | 한글화 | `TOP`, `MID`, 상태·형식 코드가 일부 공개 화면에 노출 | 모든 사용자 노출 코드를 자연스러운 한글로 변환 |
| P2 | 테스트 플레이어 | `test000`만 후보이며 테스트 여부 미확정 | 감사 근거 확인 후 soft deactivate 또는 `NO_ACTION` |
| P2 | 운영 관측 | 오류 SDK·메트릭·알림·Vercel Cron 설정 근거 없음 | job 상태·5xx·outbox 적체·외부 연동 실패 알림 구성 |

## 2. 전체 실행 순서

| 순서 | 웨이브 | 핵심 작업 | 종료 조건 | 예상 소요 |
| ---: | --- | --- | --- | ---: |
| 0 | 기준선·안전장치 | 배포 SHA, 직전 정상 배포, 운영 DB head, backup/PITR, 역할별 검수 계정, 동적 fixture 확인 | 모든 식별자와 복구 경로가 기록됨 | 30~45분 |
| 1 | P0 소스 패치 | 운영 origin 방어, 챔피언 sync/repair, Riot 과거 snapshot, 플레이어 카드 projection | focused 테스트와 dry-run 계약 통과 | 2~3시간 |
| 2 | 운영 데이터·설정 | URL 환경변수, migration head, 챔피언 backfill, Riot 단계 활성화 | 전후 건수 일치, 이미지 null 0 또는 승인 예외만 존재 | 1~2시간 |
| 3 | 핵심 E2E | 로그인, 신청, Kakao, 팀 밸런스, 경기 등록, 징계·Blob, Riot | 역할·소유권·감사 로그를 포함한 실제 왕복 성공 | 2~3시간 |
| 4 | UI/UX 디테일 | 가독성, 한글화, 모바일 터치, 상태 UI, 이미지, 문구·간격 | 변경 화면에서 세부 인수 조건 전부 통과 | 2~4시간 |
| 5 | 운영·QA 도구 | 캡처 실패 게이트, console/network 수집, CI 최종 gate, scheduler·알림 | 자동 검사가 결함을 실제 실패로 처리 | 1~2시간 |
| 6 | 데이터 정리 | 테스트 데이터 출처 확인과 복구 가능한 비활성화 | 운영 데이터 오삭제 0, 복구 시험 성공 | 30~60분 |
| 7 | 최종 검증·배포 | 전체 검사 1회, 전 페이지 캡처, push, Vercel·실사이트 smoke | 아래 완료 정의 충족 | 1~2시간 |

접근 권한과 외부 기기가 준비된 경우 병렬 기준 실제 작업은 약 6~10시간이다. 이후 24시간은 계속 작업하는 시간이 아니라 오류율과 job 적체를 관찰하는 권장 기간이다.

## 3. 웨이브 0 — 운영 기준선과 안전장치

### 해야 할 일

1. 현재 운영 SHA `38edbfd5`와 직전 정상 Vercel 배포 URL을 기록한다.
2. 운영 DB를 읽기 전용으로 확인해 migration head·checksum·테이블 수·핵심 모듈 건수를 기록한다.
3. `0025_s10_champion_image_urls` 적용 여부와 `image_url` null·invalid·중복 수를 확인한다.
4. provider backup 또는 PITR 식별자와 복구 담당자를 기록한다.
5. 실제 검수용 ACCOUNT·ADMIN·SUPER_ADMIN 계정을 각각 1개 준비한다.
6. 캡처 fixture에 playerId, matchId, draftId, seasonId, eventId, tournamentId, disciplineId, Kakao pendingId를 채운다.
7. 오래된 `STATUS.md`, `README.md`, QA 문서의 “Vercel 미전환·23 migration” 문구를 현재 사실과 분리한다.

### 세부 완료 조건

- 운영 DB URL·계정명·비밀번호는 결과 문서에 남기지 않는다.
- DB head가 소스와 다르면 migration을 자동 실행하지 않고 차이 목록만 만든다.
- backup ID가 없으면 운영 데이터 update를 시작하지 않는다.
- 관리자 인증은 우회하지 않고 정상 비밀번호→TOTP 흐름을 사용한다.
- 캡처 fixture는 합성 식별자만 보존하며 비밀번호·TOTP·cookie를 저장하지 않는다.

## 4. 웨이브 1 — 가장 먼저 수정할 P0/P1 코드

### 4.1 운영 origin·metadata 정상화

수정 대상:

- production에서 `NEXT_PUBLIC_SITE_URL` 또는 `V2_PUBLIC_ORIGIN`이 localhost면 fail-safe 운영 origin을 사용하거나 명시적 구성 오류를 표시한다.
- metadata, OG 이미지, Riot callback, same-origin, Blob public URL이 같은 canonical HTTPS origin을 사용하게 한다.

인수 조건:

- 운영 HTML에 `localhost`, `127.0.0.1`, HTTP callback이 0개다.
- canonical, Open Graph, 공유 이미지, 로그인 후 `next`가 운영 도메인을 유지한다.
- 외부 origin이나 백슬래시가 포함된 `next`는 거부한다.
- preview와 localhost 개발 환경은 기존대로 동작한다.

### 4.2 챔피언 카탈로그·이미지 복구

현재 `0025` 재실행이나 전체 cutover 재실행만으로는 해결되지 않는다. 기존 `v1-*` 행을 대상으로 별도 멱등 repair를 구현한다.

구현 항목:

1. 공식 Data Dragon의 실행 시점 버전을 명시적으로 고정한다.
2. 현재 챔피언 key·한글명·이미지 파일명을 대조하는 dry-run을 만든다.
3. 관리자 카탈로그에 이미지 URL 입력·검증·미리보기를 추가한다.
4. 기존 행은 현재값과 다른 경우만 갱신한다.
5. 없는 챔피언은 중복 key·한글명을 검사한 뒤 추가한다.
6. repair run ID, 대상·변경·건너뜀·오류 수, 버전만 기록한다.

상태 전이:

`PRECHECK → BACKUP_VERIFIED → DRY_RUN_OK → BACKFILLED → RECONCILED → COMPLETE`

오류·복구 조건:

- URL allowlist, source 중복, 예상 수 불일치, 알 수 없는 key가 있으면 update 전에 중단한다.
- backfill과 대조는 한 transaction으로 처리한다.
- 같은 repair를 두 번 실행했을 때 두 번째 변경 수는 0이어야 한다.
- 실패 시 transaction rollback, 적용 후 문제는 이전 값 snapshot 또는 PITR로 복구한다.

완료 조건:

- `/api/champions`의 활성 카탈로그 수가 공식 고정 버전과 일치한다.
- `imageUrl:null`은 0개이거나 승인된 예외 목록만 남는다.
- invalid URL 0, 중복 key·이름 0이다.
- 대표 이미지 여러 개를 실제 HTTP 200과 화면 렌더링으로 확인한다.
- 이미지 실패 시에도 이름·역할·버튼은 정상 표시된다.

### 4.3 Riot 과거 snapshot과 실시간 연결 분리

과거 이관 데이터가 있다는 사실과 현재 계정이 Riot에 연결됐다는 사실을 섞지 않는다.

화면 상태:

| 상태 | 사용자 표시 |
| --- | --- |
| `UNLINKED` | Riot 계정 연결 안내 |
| `HISTORICAL_SNAPSHOT` | 과거 저장 전적, 마지막 갱신 시각, “재연동 필요” |
| `PENDING_SYNC` | 연결 완료, 첫 동기화 대기 |
| `READY` | 현재 요약과 마지막 동기화 시각 |
| `TEMPORARY_ERROR` | 기존 snapshot 유지, 재시도 안내 |

인수 조건:

- `DISCONNECTED` 링크의 summary는 과거 데이터임을 명시한 200 응답으로 읽을 수 있다.
- 과거 snapshot 때문에 연결 상태를 `CONNECTED`로 위조하지 않는다.
- PUUID·토큰·소유 계정 ID·원본 Riot 응답은 공개 DTO에 없다.
- 404는 재연결 필요, 429는 `Retry-After`, 5xx는 제한된 backoff 대상으로 구분한다.
- 동일 sync job 중복 생성, RSO state/code 재사용을 거부한다.
- 실제 자격증명 활성화 전에도 관리자 DB 화면에서 저장된 snapshot은 볼 수 있다.
- Riot 최근 경기 목록은 요약 카드와 분리된 페이지형 read model로 제공하고, 데이터 없음·동기화 대기·rate limit·일시 장애를 구분한다.
- 최근 경기에는 큐 유형·승패·챔피언·KDA·플레이 시간·종료 시각을 표시하되 PUUID와 원본 match payload는 노출하지 않는다.

### 4.4 플레이어 카드 실제 데이터 연결

인수 조건:

- 포지션은 최신 유효한 신청 또는 집계된 선호 포지션에서 가져온다.
- 승률은 분모가 0이면 `0%`로 오해시키지 않고 “경기 기록 없음”으로 표시한다.
- 최근 경기 일시는 공개된 경기만 사용한다.
- 통계 조회 실패를 “미등록”으로 바꾸지 않고 “일시적으로 불러오지 못함”으로 구분한다.
- 목록 쿼리는 페이지당 N+1을 만들지 않고 현재 페이지 크기 안에서 한 번에 projection한다.
- 회원명은 검색 조건으로만 사용하고 공개 카드·HTML·API에는 노출하지 않는다.

### 4.5 공개 코드 한글화

표준 매핑을 한 곳에 둔다.

- `TOP/JUNGLE/MID/BOTTOM/SUPPORT` → `탑/정글/미드/원딜/서포터`
- 경기·신청·대회·Riot·징계 상태 코드는 자연스러운 한글 배지로 표시
- 내부 코드가 필요하면 관리자 상세의 보조 정보로만 제공

완료 조건:

- 공개 화면의 사용자 가시 텍스트에서 원시 enum이 0개다.
- 색상만으로 상태를 구분하지 않고 텍스트·아이콘을 함께 사용한다.

## 5. 웨이브 2 — 운영 DB와 환경 설정

### 원칙

- 전체 V1→V2 cutover를 다시 실행하지 않는다.
- 먼저 모듈별 read-only reconciliation을 만들고 차이가 있는 모듈만 전용 repair한다.
- migration과 데이터 repair는 앱 build나 일반 요청 안에서 실행하지 않는다.
- 운영 migration은 별도 URL, advisory lock, exact environment fingerprint를 사용한다.

### 세부 순서

1. `NEXT_PUBLIC_SITE_URL`과 `V2_PUBLIC_ORIGIN`을 정확한 운영 HTTPS 주소로 설정한다.
2. DB 현재 head와 target head를 읽고 pending migration·checksum을 기록한다.
3. backup/PITR를 확인한 뒤 필요한 migration만 단일 job으로 적용한다.
4. 챔피언 image repair를 dry-run한 뒤 정확한 변경 수를 확인하고 실행한다.
5. V1→V2 모듈별 source/target/mismatch count를 대조한다.
6. 의도적으로 이관하지 않은 로그·nonce·OAuth state·secret은 재설정 대상으로 분류한다.
7. Riot·Kakao·AI 기능 플래그는 자격증명과 smoke가 준비된 기능만 단계적으로 활성화한다.

### 이관 데이터 결정표

기존 이관 스크립트가 의도적으로 제외한 항목을 누락으로 오해해 전체 cutover를 반복하지 않는다.

| 데이터 | 기본 결정 | 후속 작업 |
| --- | --- | --- |
| RecruitPartyLog 전체 이력 | 집계만 보존 | 필요한 운영 지표와 기간을 정한 뒤 비식별 집계 이관 |
| Discord monitor snapshot | 의도적 폐기 | V2에서 새 heartbeat 상태 생성 |
| operation form rawText/sourceHash | 개인정보 최소화를 위해 폐기 | 상태·종류·처리 결과만 보존 여부 확인 |
| scrim 제목·lineup·memo·source/hash/rule | 기능별 결정 필요 | 현재 화면에서 필요한 필드만 privacy-bounded provenance로 설계 |
| Admin·RateLimit·Riot·Kakao 과거 로그 | 기본 폐기 | 법적·운영상 필요한 보존 기간만 별도 결정 |
| OAuth state·nonce·dedupe·sync job·image session | 반드시 폐기 | V2에서 새 일회성 상태 생성 |
| Kakao 방·발신자·secret·Discord 설정 | 이관 금지 | 운영 환경에서 최소 권한으로 재설정 |

각 행은 `보존 / 집계 보존 / 의도적 폐기 / 운영 재설정` 중 하나로 확정하고, V1 source 수와 V2 preserved/discarded 수의 합이 맞는지 기록한다.

Drizzle journal의 26개 migration과 함께 `0009`, `0010` snapshot lineage 누락 여부도 점검한다. 이는 현재 runtime migration 차단 사유는 아니지만 이후 schema generate·drift 검증에서 불명확성을 남기지 않도록 보완한다.

### 완료 증거

- migration 전후 head·checksum·시작/종료 시각
- 모듈별 source/target/mismatch 수와 mismatch 0
- 챔피언 대상/변경/예외 수
- secret을 제외한 feature 상태
- 실패 시 안전한 phase code와 rollback 결과

## 6. 웨이브 3 — 실제 사용자·관리자·외부 연동 E2E

### 6.1 인증·권한

| 행위 | ACCOUNT | ADMIN | SUPER_ADMIN |
| --- | ---: | ---: | ---: |
| 공개·본인 계정 | 200 | 200 | 200 |
| 관리자 일반 조회 | 401/403 | 200 | 200 |
| 징계 기록 조회 | 401/403 | 200 | 200 |
| 징계 수정·삭제·증빙 심사 | 401/403 | 403 | 성공 |
| 팀 초안 보관·복구 | 401/403 | 성공 | 성공 |
| 사이트 설정·감사 로그·전체 정리 | 401/403 | 403 | 성공 |

세부 확인:

- 로그인 실패 401, 권한 부족 403, 제한 초과 429, 구성·DB 장애 503을 구분한다.
- TOTP 등록→활성화→재로그인 후 이전 세션이 거부된다.
- 같은 TOTP 코드 재사용은 거부된다.
- 비밀번호·TOTP·cookie·secret은 로그·화면 캡처에 남지 않는다.

### 6.2 시즌 신청→Kakao→팀 밸런스→경기 등록

정상 흐름:

1. 사이트에서 주·부 포지션과 날짜·회차를 신청한다.
2. V41 봇 현황에 같은 양식으로 표시한다.
3. 같은 신청을 봇에서 재입력해도 중복 행이 생기지 않는다.
4. 통합 신청자 10명을 팀 밸런스로 가져온다.
5. 이름 옆 포지션 버튼으로 조정한다.
6. `종합 균형/라인 균형/주 포지션 우선` 후보가 각각 기준과 지표를 표시한다.
7. 수동 배치 후 서버 평가·선택·저장한다.
8. 관리자가 선택 팀으로 경기 등록 화면을 열어 정확한 10명·팀·포지션을 확인한다.
9. 저장 직전 draft revision·round·signature·선수 구성을 재검증한다.

오류·중복 조건:

- SITE 또는 관리자 확정 값을 후속 bot snapshot이 덮어쓰지 않는다.
- 동명이인·Riot ID 누락·미매칭은 임의 병합하지 않고 pending으로 보낸다.
- 잘못된 서명·허용되지 않은 방/발신자·만료 timestamp는 401이다.
- 같은 idempotency key+같은 body는 replay, 다른 body는 409이다.
- stale revision은 412 후 최신 상태를 다시 조회한다.
- 51명 이상은 현재 명확한 오류를 표시하고, 후속 패치에서 paging 또는 사이트 링크를 제공한다.

### 6.3 Riot 실제 연동

순서:

1. public origin과 callback을 확인한다.
2. API/RSO/encryption/job secret을 서로 분리해 설정한다.
3. DB feature flag를 활성화한다.
4. 마지막에 runtime integration flag를 활성화한다.
5. 사용자 1명이 RSO로 재연결한다.
6. sync 1건을 실행해 `QUEUED → RUNNING → SUCCEEDED`를 확인한다.
7. 404·429·5xx 상태를 각각 확인한다.

복구는 feature flag를 먼저 끄고 link·summary 데이터는 유지한다. 전체 unlink나 테이블 삭제는 하지 않는다.

### 6.4 징계 증빙·Vercel Blob

- 허용 형식 PNG/JPEG/WebP, 최대 4MiB를 실제 업로드로 확인한다.
- 소유자는 자신의 제출만, ADMIN은 허용 목적만, SUPER_ADMIN은 관리 범위를 본다.
- 타 사용자 asset ID 직접 접근은 403/404다.
- 저장 실패·중단·재시도 시 중복 자산이 생기지 않는다.
- 증빙 검토·기록 수정·삭제는 SUPER_ADMIN만 가능하다.
- 복구 가능한 정리와 실제 restore를 확인하기 전 cleanup을 실행하지 않는다.

## 7. 웨이브 4 — UI/UX 디테일 기준

### 7.1 전역 가독성·조작 기준

| 구분 | 세부 기준 |
| --- | --- |
| 본문 | 모바일·데스크톱 기본 14px 이상, 주요 설명 15~16px 권장 |
| 보조 문구 | 12px 미만 금지. 9~11px 후보 규칙 203곳을 실제 중요도별 검토 |
| 행간 | 본문 1.5~1.75, 제목 1.15~1.35 |
| 터치 영역 | 버튼·링크·필터·아이콘 최소 44×44px |
| 대비 | 일반 텍스트 4.5:1, 큰 텍스트 3:1 이상 |
| 포커스 | 모든 조작 요소에 선명한 `:focus-visible`, modal 닫힘 뒤 호출 요소로 복귀 |
| 상태 | 기본·hover·focus·pressed·disabled·loading·success·error를 모두 구분 |
| 오류 | 입력 옆 원인, 상단 요약, 재시도/복구 행동 제공. 입력값은 보존 |
| 반응형 | 390px, 768px, 1440px에서 가로 넘침·고정 메뉴 겹침·잘림 0 |
| 모바일 키보드 | 검색·폼 입력 시 하단 메뉴와 제출 버튼이 가려지지 않음 |
| 모션 | 160~220ms, `prefers-reduced-motion`에서 비필수 애니메이션 제거 |
| 이미지 | 명시적 비율·크기, lazy loading, 실패 fallback, 의미 이미지 alt 제공 |
| 표 | 좁은 화면에서 카드 전환 또는 명확한 가로 스크롤 힌트 제공 |

### 7.2 화면별 디테일 체크리스트

#### 홈

- 첫 화면에 `우리 같이 롤하자~`, 오늘의 안내 챔피언, 핵심 CTA가 한눈에 보인다.
- 최신 명시 요구대로 오늘의 안내 챔피언은 전체 활성 챔피언 풀을 사용한다.
- 다른 장식·히어로 이미지는 여성 챔피언 중심으로 유지한다.
- 경기 실제 기록의 챔피언 이미지는 성별과 무관하게 실제 선택 챔피언을 표시한다.
- KST 날짜 기준으로 하루 동안 같은 안내 챔피언이 보이고 다음 날 변경된다.
- 모든 챔피언에 고유하거나 검수된 문구가 있으며 범용 문구 남발을 줄인다.
- 랭킹은 순위·닉네임·티어·경기 수·승률의 단위가 명확하고 빈 상태가 자연스럽다.
- 영문 상태 코드와 불필요한 긴 소개 문장을 노출하지 않는다.

#### 로그인·내비게이션

- 로그인 성공 시 안전한 `next`가 없으면 홈으로 이동한다.
- 로그인 전 `로그인`, 로그인 후 `내 정보`가 상단·모바일 메뉴에 동일하게 보인다.
- 뒤로가기·새로고침·세션 만료 시 루프 없이 올바른 안내로 이동한다.
- 현재 메뉴는 `aria-current`, 아이콘만 있는 버튼은 접근 가능한 이름을 가진다.
- 모바일 하단 메뉴는 safe-area를 반영하고 콘텐츠를 덮지 않는다.

#### 플레이어 목록

- 검색 대상은 회원명·닉네임·Riot ID지만 회원명은 결과에 공개하지 않는다.
- 티어 버튼은 선택 상태가 시각·텍스트·`aria-pressed/current`로 드러난다.
- 카드에는 실제 포지션·경기·승률만 표시하고 없는 값을 만들어내지 않는다.
- 검색 중, 결과 없음, 일시 장애, 잘못된 검색어를 서로 다른 문구로 표시한다.
- 긴 닉네임·태그·티어명이 한 줄을 깨뜨리지 않는다.

#### 플레이어 상세·경기 상세

- 챔피언 이미지의 정사각/카드 비율이 일정하고 깨짐·없음 fallback이 있다.
- KDA, 승패, 포지션, 티어, 마지막 갱신 시각의 기준과 단위를 표시한다.
- Riot 과거 snapshot과 현재 연결 상태를 혼동시키지 않는다.
- 최근 경기·프로필 요약에서 같은 챔피언 key가 같은 이미지·한글명을 사용한다.
- 모바일에서 게임별 참가자 정보가 너무 작은 표로 축소되지 않는다.

#### 팀 도구

- 팀 도구 진입 시 랜덤 팀이 기본이며 랜덤 팀·코인 토스·팀 밸런스·내 초안 이동이 일관된다.
- 신청자 가져오기는 전체/SITE/Kakao와 날짜·회차를 명확히 표시한다.
- 포지션 버튼은 이름 바로 옆에 있고 선택·중복·불가 상태가 보인다.
- 후보 3개는 `1안/2안/3안` 사진 없이 각 선정 기준·전력 차·라인 차·선호 충족률을 보여준다.
- “선택한 후보” 대신 실제 기준명을 제목에 표시한다.
- 수동 배치는 드롭다운 없이 카드 옆에 닉네임·Riot ID·티어·선호/가능 포지션·평가 점수를 표시한다.
- 데스크톱 드래그, 키보드 2단계 교체, 모바일 터치 또는 명확한 버튼 대안을 제공한다.
- 저장·재평가·보관·복구 중에는 중복 요청을 막고 성공 후 최신 revision을 표시한다.
- 일반 사용자는 자신의 초안만 보고 관리자는 전체 초안을 보관·복구할 수 있다.

#### 신청·Kakao

- 사이트와 봇이 `플레이어/신청일/회차/Riot ID/주라인/부라인/상태/출처` 순서를 공유한다.
- 수정·취소 후 이전 값과 현재 값이 혼동되지 않는다.
- pending에는 자동 처리하지 못한 이유와 관리자 확인 상태가 표시된다.
- 공개 화면에는 raw body, sourceHash, 회원명, 방·발신자 식별자가 없다.

#### 내 계정·징계

- 참여 경기·이벤트·멸망전과 시즌 신청을 한 흐름에서 찾을 수 있게 한다.
- 주의·경고·밴은 현재 유효 건수와 상세 이동을 제공한다.
- 증빙 업로드 전 형식·용량을 알리고 진행률·성공·재시도·중복 상태를 표시한다.
- 민감 사유와 내부 메모는 공개·일반 사용자 DTO에서 제외한다.

#### 이벤트전·멸망전

- 모집→팀 구성→진행→완료 단계를 현재 위치와 다음 행동으로 표현한다.
- 일정·참가자·팀·대진·결과·MVP·갤러리의 정보 우선순위를 고정한다.
- 원시 format/status/position enum을 한글화한다.
- 모바일에서 대진표가 잘리면 축소가 아니라 스크롤·단계 카드로 제공한다.
- 이미지가 화려함을 보조하지만 결과·버튼·텍스트를 가리지 않는다.

#### 콘텐츠 관리자

- 챔피언·하이라이트·갤러리가 같은 탭·헤더·필터·목록 행·상태 배지·버튼 위치를 사용한다.
- 등록·편집 폼의 저장/취소/비활성화 위치와 경고 강도를 통일한다.
- 챔피언 이미지는 URL 검증·미리보기·실패 메시지·fallback을 제공한다.
- ADMIN과 SUPER_ADMIN의 가능한 행동만 노출하고 서버 권한과 일치한다.

#### 관리자 전체

- 목록은 검색·필터·페이지·빈 상태·오류 상태를 모두 가진다.
- 위험 작업은 대상 이름, 영향, 복구 가능 여부를 보여주고 이중 실행을 막는다.
- `참가인원 집계` 등 운영자가 이해할 수 있는 명칭을 사용한다.
- API 401/403/409/412/429/503을 같은 “오류” 문구로 뭉개지 않는다.
- ADMIN과 SUPER_ADMIN 화면 차이는 숨김만이 아니라 서버 응답으로도 검증한다.

## 8. 웨이브 5 — QA·CI·운영 관측 보강

### 캡처 하네스

현재 캡처 도구는 오류를 기록해도 실패 종료하지 않으므로 다음을 추가한다.

- non-200, 잘못된 final URL, 가로 overflow, 누락 H1, console error, pageerror, 실패한 API·이미지 요청을 수집한다.
- 중요 문제가 1개라도 있으면 프로세스 exit code를 실패로 만든다.
- PUBLIC·ACCOUNT·ADMIN·SUPER_ADMIN·TOTP_SETUP 세션을 분리한다.
- 정상·로딩·빈·오류·권한 없음·보관 상태를 fixture로 만든다.
- 102개 현재 페이지와 query variant를 데스크톱·태블릿·모바일 약 332개 조건으로 생성한다.
- 사람이 전체 이미지를 반복해서 읽기 전에 contact sheet와 실패 목록을 우선 검토한다.

### CI 출시 gate

`main` 출시 후보에는 다음을 한 번에 실행하고 artifact를 보존한다.

1. `npm run check`
2. `npm run test:db`
3. `npm run verify:auth-http`
4. `npm run security:secrets`
5. `npm audit --omit=dev --audit-level=moderate`
6. schema drift와 migration checksum
7. browser quality·접근성·캡처 실패 목록

일반 작은 패치에서는 변경 범위 lint·타입·단위 테스트만 실행하고, 전체 gate는 웨이브 마지막에 한 번 실행한다.

### Scheduler·관측

- Riot sync, Kakao daily close, rate-limit/maintenance cleanup, discipline asset recover/cleanup의 provider schedule을 명시한다.
- signed timestamp·nonce·HMAC, 동일 window 중복 방지, 제한된 재시도를 사용한다.
- 마지막 성공 시각, 처리 수, 실패 수, outbox 적체를 관리자 화면에서 본다.
- 반복 5xx, job 실패 누적, outbox 임계치, Blob 오류에 알림을 설정한다.
- `/api/health`는 공개 최소 상태를 유지하고, migration/Blob/scheduler/외부 연동 상세 health는 관리자 전용으로 분리한다.

## 9. 웨이브 6 — 테스트 데이터 정리

대상 후보: `test000` (`a8ee9211-7553-4680-af78-354abce162d6`)

순서:

1. 감사 로그에 `targetId` 검색을 추가한다.
2. `PLAYER_CREATED` actor, sourceRunId, legacy ID, 연결 계정, 경기·통계·신청·징계 참조를 확인한다.
3. 실제 사용자 활동이 있거나 테스트 근거가 없으면 `NO_ACTION`으로 종료한다.
4. 테스트임이 확정되면 hard delete 대신 `ACTIVE → INACTIVE`로 비활성화한다.
5. 공개 검색 제외, 참조 데이터 유지, 관리자 비활성 목록 표시를 확인한다.
6. reactivate로 복구 가능한지 시험한 뒤 최종 상태를 결정한다.

완료 조건:

- 운영 사용자 오삭제 0
- stale revision 412, idempotency replay 정상
- `PLAYER_DEACTIVATED` 감사 이벤트 존재
- 관련 경기·통계·신청 기록 보존
- cleanup hard delete는 provenance 증거 보존 전 실행하지 않음

## 10. 역할 분배

| 역할 | 담당 |
| --- | --- |
| 총괄·통합 | 요구사항 ledger, 우선순위, 충돌 해결, 커밋·배포 판정 |
| DB·이관 | migration runner, reconciliation, champion repair, backup·복구 증거 |
| 인증·외부 연동 | ACCOUNT/ADMIN/SUPER 권한, Riot, Kakao, Blob, signed job |
| 제품·UI | 가독성, 한글화, 상태 UI, 모바일·키보드, 이미지·문구 |
| QA·릴리스 | focused gate, 전체 gate, 캡처, 성능·접근성, 배포·롤백 |

병렬 작업은 서로 다른 namespace에서 진행하고 공통 DB schema·전역 CSS·route contract는 총괄이 순차 통합한다.

## 11. 커밋·배포 단위

| 배포 | 포함 범위 | 배포 직후 확인 |
| --- | --- | --- |
| Patch A | origin, 챔피언 repair 도구·UI, Riot snapshot, 플레이어 projection | health, champions, players, Riot 상태 |
| Patch B | Kakao/팀 도구/경기 E2E 보완, 권한·감사 검색 | 신청, draft, 관리자 경기, 401/403/409/412 |
| Patch C | 가독성·한글화·모바일·상태 UI | 변경 화면 390/768/1440 집중 캡처 |
| Patch D | QA/CI/scheduler/관측 | final workflow와 실패 알림 |

각 patch는 focused gate 후 `main`에 push하고 Vercel 성공과 실사이트 smoke를 확인한다. 운영 DB update와 외부 기기 변경은 앱 push와 분리해 전후 증거를 남긴다.

## 12. 최종 완료 정의

다음 조건을 모두 만족해야 “완료”로 판정한다.

- 알려진 P0·P1 결함 0개
- 운영 URL에 localhost 참조 0개
- 챔피언 카탈로그 대조 완료, 이미지 null·invalid 0 또는 승인 예외만 존재
- 플레이어·통계·경기·신청·팀 도구 핵심 API 반복 5xx 0
- Riot 과거 snapshot·미연동·대기·정상·일시 오류가 정확히 구분됨
- SITE/Kakao 중복 신청 0, 관리자 확정 값 덮어쓰기 0
- ACCOUNT·ADMIN·SUPER_ADMIN 권한 매트릭스 전부 통과
- 관리자 초안→경기 등록의 draft provenance와 정확한 10명 배치 확인
- 비공개 자산·개인정보 권한 누출 0
- 공개 사용자 화면 원시 enum 0
- 가로 overflow·고정 메뉴 겹침·치명적/중대 접근성 오류 0
- 키보드와 모바일 터치로 핵심 행동 완료 가능
- GitHub final gate, Vercel 배포, 실사이트 smoke 성공
- 최신 전체 화면 캡처·QA 문서·Discord 공지·롤백 근거 저장
- 운영 DB·외부 연동 변경은 backup과 복구 증거를 보유

“개선 가능성이 전혀 없음”은 객관적으로 증명할 수 없으므로, 완료 판정은 위 측정 가능한 기준에서 **알려진 중요 결함 0, 미검증 핵심 흐름 0**을 의미한다. 이후 새 사용자 제보와 운영 지표는 별도 후속 patch로 관리한다.

## 13. 롤백 조건

다음 중 하나면 다음 작업을 멈추고 롤백 또는 feature disable을 우선한다.

- health 3회 중 2회 이상 실패
- 로그인 또는 ADMIN/SUPER 권한 경계 실패
- 챔피언·통계·신청·경기 API에서 반복 5xx
- migration head·checksum·핵심 데이터 건수 불일치
- Kakao 중복 신청 또는 SITE/관리자 값 덮어쓰기
- 비공개 이미지·회원명·계정 정보·secret 노출
- Riot sync 중복 job 또는 무제한 재시도

복구 순서:

1. Riot/Kakao/AI 등 외부 기능 flag를 비활성화한다.
2. 앱은 직전 정상 Vercel 배포를 재승격한다.
3. DB는 수동 `DROP/TRUNCATE`나 하향 migration을 사용하지 않는다.
4. 미커밋 transaction은 rollback하고, 이미 반영된 데이터는 forward-fix 또는 검증된 PITR/archive로 복구한다.
5. health·로그인·플레이어·경기·신청 smoke를 다시 실행하고 실제 복구 시간을 기록한다.

## 14. 근거 문서

- `docs/qa-evidence/v2-live-review-patch-2026-09-08/README.md`
- `docs/qa-evidence/v2-requirements-completion-2026-09-08/REQUIREMENTS_MATRIX.md`
- `docs/qa-evidence/v2-final-2026-09-07-r2/REPORT.md`
- `docs/operations/DATABASE_RECOVERY_RUNBOOK.md`
- `docs/operations/KAKAO_V2_CUTOVER_RUNBOOK.md`
- `docs/operations/RIOT_PRODUCTION_RUNBOOK.md`
- `docs/design/DESIGN_TOKENS.md`
- `docs/feature-catalog/USER_INVENTORY.md`
- `docs/feature-catalog/ADMIN_INVENTORY.md`
