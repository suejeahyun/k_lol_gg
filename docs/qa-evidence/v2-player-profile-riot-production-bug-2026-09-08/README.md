# 플레이어 상세·Riot 공개 전적 운영 오류 점검

점검일: 2026-09-08 (KST)

## 운영 읽기 증거

운영 환경에는 쓰기 작업을 하지 않고 공개 HTTP 응답만 확인했다.

| 경로 | 결과 | 판정 |
| --- | --- | --- |
| `/players/a3e37453-d88d-4521-a487-bf0085bc0701` | HTTP 200, 기본 프로필 표시, 통계 오류 상태 | 플레이어 기본 조회는 정상이며 통계 하위 조회만 실패 |
| `/api/health` | HTTP 200, `ready` | 애플리케이션과 기본 DB 연결은 준비됨 |
| `/api/rankings` | HTTP 200 | 기존 통계성 데이터 일부는 조회 가능 |
| `/api/stats/player/a3e37453-d88d-4521-a487-bf0085bc0701/summary` | HTTP 503, `STATISTICS_SERVICE_UNAVAILABLE` | 플레이어 통계 저장소 조회 실패 |
| `/api/stats/player/a3e37453-d88d-4521-a487-bf0085bc0701/recent` | HTTP 503, `STATISTICS_SERVICE_UNAVAILABLE` | 최근 경기 조회도 같은 계층에서 실패 |
| `/api/champions` | HTTP 503, `CHAMPION_SERVICE_UNAVAILABLE` | 챔피언 카탈로그의 공통 image URL 조회 실패와 일치 |
| `/api/riot/player/a3e37453-d88d-4521-a487-bf0085bc0701/summary` | HTTP 503, `RIOT_INTEGRATION_UNAVAILABLE` | 공개 읽기가 Riot 쓰기·RSO 비밀 구성과 과도하게 결합됨 |

## 원인 판정

- **확인됨:** 플레이어 기본 프로필은 운영에서 표시된다. 제보의 “프로필 실패”는 프로필 안 통계 블록의 실패다.
- **확인됨:** 챔피언 목록과 플레이어 통계 저장소는 모두 `catalog.champions.image_url`을 읽는다.
- **추정(강함):** 소스에는 `0025_s10_champion_image_urls.sql`이 있지만 운영의 챔피언 API와 통계 API만 동시에 503이므로, 운영 DB에 0025가 아직 적용되지 않아 PostgreSQL `42703`이 발생한 정황과 일치한다. 운영 DB와 비밀 로그는 열람하지 않았으므로 오류 코드는 미확인이다.
- **확인됨:** 기존 공개 Riot 경로는 API 키, RSO 자격 증명, 암호화 키, 작업 서명 비밀까지 모두 준비되어야 런타임이 생성됐다. 저장된 공개 요약을 읽는 데 필요 없는 조건이다.

## 소스 수정 상태

- 챔피언 이미지 projection을 `to_jsonb("champions") ->> 'image_url'` 방식으로 바꿨다. 0025 전에는 `null`, 적용 후에는 저장 URL을 반환하므로 배포 순서와 관계없이 목록·통계를 읽을 수 있다.
- 공개 Riot 조회 전용 저장소를 추가했다. 공개 플레이어, 연결 여부, 공개 요약 필드만 읽으며 API/RSO/암호화/작업 비밀 구성과 분리했다.
- 공개 프로필은 `미연동`, `연결 후 동기화 대기`, `일시 오류`, `정상 요약`을 서로 다른 안내로 표시한다.
- 연결된 PUUID, 소유 계정 ID, OAuth 코드·토큰 등 비공개 필드는 조회 projection과 응답 DTO에 포함하지 않는다.
- 운영에는 배포하지 않았고 운영 DB migration도 실행하지 않았다. 현재 판정은 **소스만 반영**이다.

## 검증

- `npm run typecheck`: 통과
- 관련 ESLint: 통과
- 공개 Riot·UI 계약 테스트: 13개 통과
- `V2_DB_CONTRACT_SCOPE=riot npm run test:db`: 2개 통과, 격리 DB 종료·삭제 확인
- `V2_DB_CONTRACT_SCOPE=champions npm run test:db`: 1개 통과. 트랜잭션 안에서 `image_url`을 제거한 구버전 스키마 읽기를 확인하고 롤백함
- `V2_DB_CONTRACT_SCOPE=statistics npm run test:db`: 1개 통과

## 디스코드 공지 초안

```text
🔧 플레이어 상세 조회 개선 안내

- 플레이어 프로필 통계가 챔피언 이미지 DB 업데이트 순서와 관계없이 표시되도록 개선했습니다.
- 이미 저장된 Riot 공개 전적은 Riot 쓰기 연동 설정과 별도로 안전하게 조회합니다.
- Riot 미연동, 첫 동기화 대기, 일시 오류를 구분해 안내합니다.

현재 소스 검증까지 완료했으며 운영 반영 후 대상 프로필과 API를 다시 점검할 예정입니다.
```

## 다음 패치 권장

1. 운영 DB 백업과 변경 창을 확보한 뒤 0025 migration을 적용하고 챔피언 API를 재점검한다.
2. 운영 배포 직후 대상 플레이어의 프로필·최근 경기·Riot API를 공개 HTTP smoke test로 확인한다.
3. Riot 계정이 연결됐지만 요약이 없는 사용자 수를 비식별 집계해 동기화 대기 상태를 운영자가 확인할 수 있게 한다.
4. 공개 API의 503 로그에 비밀 없는 오류 분류(`schema`, `database`, `configuration`)와 trace ID를 남겨 재발 진단 시간을 줄인다.
