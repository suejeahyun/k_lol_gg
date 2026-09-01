# 0005 — 사용자 IA와 플레이어 등록부 1차 파동

상태: 구현 및 로컬 검증 완료, 전체 사용자 기능 동등성은 미완료

## 결정

1. 사용자 canonical 37개는 `USER_ROUTE_MAP.md`의 여섯 영역으로 고정하고
   `src/modules/navigation/domain/user-navigation.ts`를 실행 가능한 manifest로 사용한다.
2. 이 파동에서 `page-contract`는 `/`, `/players`, `/players/[playerId]` 세 경로뿐이다.
   이는 ready/empty/error/loading 페이지 상태 구현을 뜻하며 V1 기능 동등성이나 운영 준비 완료를
   뜻하지 않는다. 아직 구현되지 않은 경로는 메뉴에서 링크처럼 동작시키지 않고 `준비 중`으로 표시한다.
3. 공개 셸은 하나의 responsive URL을 사용한다. 데스크톱 상단 탐색, 모바일 하단 5개 진입점,
   skip link, 현재 페이지 표시, native modal search/menu를 제공한다.
4. 플레이어 사용자 화면은 fixture를 사용하지 않는다. `V2_PUBLIC_DATA_SOURCE=postgres`와
   `DATABASE_URL`이 함께 명시될 때만 V2 PostgreSQL read model을 사용하고, 그 전에는
   `unavailable` 상태를 표시한다.
5. 공개 projection에는 `id`, 공개 표시명/Riot ID, 허용된 티어와 준비된 집계만 포함한다.
   회원명, 계정 ID, 로그인 ID, Discord 식별자, 내부 보정 사유는 반환하지 않는다.

## App Router 구조

| route group | 역할 | 이 파동의 경로 |
|---|---|---|
| `(public)/(home)` | 공개 홈 | `/` |
| `(public)/(registry)` | 공개 등록부 | `/players`, `/players/[playerId]` |
| `(public)/(legacy)` | 한 릴리스 호환 page fallback | `/app`, `/app/players` |

`src/proxy.ts`는 위 두 legacy 경로의 GET/HEAD만 render 이전에 308로 이동한다. `/app`은
`source=pwa`, `/app/players`는 `q`, `page`만 보존한다. 그 밖의 query,
외부 `next`, 토큰처럼 보이는 값은 버린다. POST 등 mutation은 redirect하지 않는다.
`/app/players/[playerId]`는 V1 숫자 ID와 V2 UUID mapping이 없으므로 깨진 영구 redirect를
만들지 않고 planned blocker로 남겼다.

## 구현된 사용자 상태

### 홈

- 플레이어 검색 GET form과 공개 데이터 연결 상태가 동작한다.
- PostgreSQL 연결 시 활성 플레이어 수만 읽는다.
- 시즌, 최근 경기, 구인, 대회, 갤러리는 현재 V2 schema가 없으므로 숫자를 꾸며내지 않고
  명시적인 `스키마 대기/다음 파동` 상태를 표시한다.

### 플레이어 목록

- 닉네임/Riot ID prefix 검색, 80자 입력 제한, 12개 단위 pagination.
- active player만 조회하고 안정적인 닉네임/태그 정렬을 적용한다.
- ready, empty, error, unavailable, loading 상태를 갖는다.
- query는 `q`, `page`만 읽고 중복 query는 첫 값만 사용한다.

### 플레이어 상세

- 공개 표시명, Riot ID, 현재/최고 티어, 등록일을 표시한다.
- PostgreSQL 연결 시 inactive/missing UUID는 404다. 데이터 소스 자체가 미설정이면 샘플 대신
  명시적인 `unavailable` 화면을 표시한다.
- 시즌/포지션/챔피언/최근 경기 schema가 아직 없어 각 영역을 `아직 연결되지 않음`으로 표시한다.
- legacy 양의 정수 ID에서 V2 UUID로의 이관 mapping은 아직 없다. 이 mapping 없이는
  `/app/players/:legacyId`가 canonical로 이동한 뒤 404가 될 수 있으므로 전환 blocker로 남긴다.

## 공지·뉴스·패치노트 판정

`USER_INVENTORY.md`와 `USER_ROUTE_MAP.md`의 73개 화면/37개 canonical에는 공지·뉴스·패치노트
목록 또는 상세가 없다. V1의 `docs/KLOL_REMOVE_COMMUNITY_NOTICE_EVENT_NOTICE.md`와
`20260629095000_remove_community_notice_features` migration은 사이트 공지와 이벤트 공지를
삭제 대상으로 기록한다. 따라서 이 파동에서 존재하지 않는 content type이나 샘플 게시물을 만들지 않았다.
새 콘텐츠 기능이 필요하면 V1 동등성 작업과 분리해 product decision, schema, 관리자 작성/게시 권한,
보존 정책을 먼저 승인해야 한다.

## 확인된 미완료

- 홈: 시즌·최근 경기·구인·대회·갤러리 실제 read model.
- 플레이어: 시즌 집계, 포지션, 챔피언, 최근 경기, Riot 공개 요약, 고급 filter/sort.
- V1 숫자 ID → V2 UUID migration mapping.
- canonical 37개 중 나머지 34개 기능 구현과 역할별 E2E.
- production 데이터 migration/count/hash/invariant 대조.
- production 캡처와 전체 viewport/browser/accessibility audit.

이 항목이 남아 있으므로 사용자 기능 동등성 또는 V2 완성으로 판정하지 않는다.
