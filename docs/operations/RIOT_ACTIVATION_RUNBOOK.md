# Riot API 공개 전적 활성화와 RSO 준비

작성 기준: 2026-09-22, `integrations-activation@1.0.0` 후보 소스. 이 문서는 설정·코드·로컬 검증 절차이며 실제 배포·환경·DB flag·공급자 응답은 해당 버전의 `docs/qa-evidence/integrations-activation-v1.0.0-2026-09-22/` 증거를 별도로 따른다.

## 현재 구분

| 경로 | 필요한 조건 | 의미 |
|---|---|---|
| 본인/관리자의 명시적인 공개 전적 연결 | 운영 API 설정, 승인된 서비스 계정, 등록된 Riot ID 일치, mutation 권한 | `DIRECT_OWNER` 또는 `ADMIN`. Riot 계정 소유권 확인이 아니다. |
| 연결된 계정의 공개 티어·최근 솔로 요약 | 위 조건 및 복호화 가능한 기존 연결, 동기화 job | Riot 공식 League/Match API의 공개 자료. 원본 Match JSON은 저장하지 않는다. |
| Riot 로그인으로 소유권 확인 | 별도 승인된 RSO 클라이언트, 정확한 callback·state·암호화 설정, 사용자 OAuth 완료 | 기존 `RSO_VERIFIED` 계약을 적용한다. API 키만으로 이 상태를 만들지 않는다. |
| 고정 status-v4 진단 | 운영 signed job 인증, 환경·DB feature flag, API 설정 | 해당 시각의 KR status-v4가 키를 수락했는지만 확인한다. League/Match 권한·production key 등급·RSO 승인은 확인하지 않는다. |

사용자 확인 사항은 운영 API 키 보유, RSO 승인 없음이다. 사전 DB 집계에서는 연결 92건이 모두 `DISCONNECTED`, 동기화 job 0건이었다. 이 기록은 사전 점검 시점의 상태이며 이후 상태를 대신하지 않는다. 기존 연결을 자동으로 복구하거나 회원을 대신해 동의하지 않는다.

## 공식 근거와 신청 자료

2026-09-22 확인한 Riot 1차 문서:

- [LoL RSO Integration](https://developer.riotgames.com/docs/lol#rso-integration): production API key가 선행 조건이고 승인 후 개발자 포털 메시지를 통해 RSO 절차를 진행한다.
- [Developer FAQ](https://developer.riotgames.com/docs/faqs): 승인된 production application ID, 서비스 웹사이트 및 사용자 흐름을 준비한다.
- [OAuth Client Documentation](https://support-developer.riotgames.com/hc/en-us/articles/22897607341075-OAuth-Client-Documentation): API product와 별도로 OAuth client 승인·설정이 필요하다.
- [League-v4 공식 API 상세](https://developer.riotgames.com/api-details/league-v4): 확인 시점 API 사양은 `/lol/league/v4/entries/by-puuid/{encryptedPUUID}`를 제공한다. 이번 변경은 기존 summoner ID 중간 조회와 `entries/by-summoner` 의존을 제거했다. 이는 현재 사양 조회 근거이며 제거 시행일을 추정하지 않는다.
- [LoL status-v4 공식 API 상세](https://developer.riotgames.com/api-details/lol-status-v4): 고정 `/lol/status/v4/platform-data` 진단 경로의 근거다.

RSO 신청에는 실제 제품명 K-LOL.GG, 운영 URL, production application ID, 담당 연락처, 서비스 약관·개인정보 처리방침 URL, Riot 고지 위치, 로그인→서비스 승인→명시 연결→해제의 화면/시연을 준비한다. RSO callback은 `V2_PUBLIC_ORIGIN`의 `/api/me/riot/rso/callback` 하나로 등록한다. 자격 증명은 승인 후 제공자의 sensitive 환경 설정으로 전달하고 채팅·이슈·문서에 붙이지 않는다.

신청 설명에서 공식 공개 티어·솔로 경기 요약과 사이트 자체 내전 기록을 구분한다. 공식 숨은 MMR을 계산하거나 소유권을 확인했다는 설명을 쓰지 않는다. 이번 Match-v5 수집은 `queue=420`만 사용한다. Riot의 custom-match 데이터 공개에 필요한 별도 opt-in을 이 연결로 대신하지 않는다.

## API-only 설정

서버 설정의 존재와 형식은 `readRiotConfigurationReadiness`로 평가한다. 값은 출력하지 않는다.

| 설정 | API 공개 전적 | RSO |
|---|---|---|
| `V2_RIOT_INTEGRATION_ENABLED=true`와 DB `site_settings.features_json.riotIntegration=true` | 둘 다 필요 | 둘 다 필요 |
| `V2_PUBLIC_DATA_SOURCE=postgres`, `DATABASE_URL`, canonical `V2_PUBLIC_ORIGIN` | 필요 | 필요 |
| `RIOT_API_KEY`, `RIOT_API_REGIONAL_ROUTE=asia`, `RIOT_API_PLATFORM_ROUTE=kr` | 필요 | 공개 전적에도 동일 |
| `RIOT_ENCRYPTION_KEYS` 유효한 AES-256 키링 | 필요 | 필요 |
| `OPERATIONS_JOB_SECRET` | 필요 | 기존 운영 인증에도 사용 |
| `CRON_SECRET` | Vercel 자동 갱신 필요 | 별도 |
| `RIOT_REQUEST_TIMEOUT_MS` | 기본 5000, 허용 1000~15000 | 동일 timeout 설정 |
| `RIOT_RSO_CLIENT_ID`, `RIOT_RSO_CLIENT_SECRET`, `RIOT_RSO_STATE_SECRET`, `RIOT_RSO_REDIRECT_URI` | 없어도 가능 | 승인 후 모두 필요 |

RSO 일부 설정 누락이나 잘못된 callback은 RSO만 비활성화한다. API 키·암호화·서명 설정이 부족하면 API runtime도 비활성화한다. `apiConfigured`/`rsoConfigured`는 설정 검사이며 실제 공급자 승인 증거가 아니다. 신규 키링은 복구 가능한 secret 저장소에 보관한다. 이미 사용한 키 ID를 지우면 기존 PUUID를 복호화할 수 없으므로 키 교체 시 기존 키를 함께 유지한다.

## 자동 동기화 계약

- Vercel cron은 `GET /api/cron/riot-sync`, `*/5 * * * *`, `maxDuration=60`이다. 정확한 경로·GET·query 없음·Bearer `CRON_SECRET`을 검사한 뒤 서버가 매 호출 새로운 nonce의 HMAC 서명으로 기존 consumer를 호출한다.
- 한 호출은 처리 가능한 job 최대 1건을 소비한다. 현재 claim 가능한 job이 없으면 조건을 만족한 현재 연결 최대 1개에 job을 만들고 소비한다. 기존 수동 `POST /api/internal/jobs/riot-sync`는 예약 후보를 자동 생성하지 않고 대기 job만 소비한다.
- 후보는 `CONNECTED`, 복호화 자료 존재, 플레이어 `ACTIVE`, 계정 `APPROVED`, 소유자 및 현재 등록 Riot ID 일치가 모두 필요하다. `DISCONNECTED`/`REVOKED` 또는 서비스 미승인 계정은 자동 연결/갱신하지 않는다.
- 계정당 예약 요청 최소 간격은 6시간이다. **6시간마다 갱신을 보장하지 않는다.** 5분에 최대 1건, 수동 큐 우선, 실패 재시도·공급자 대기·잠금 경쟁 때문에 더 늦을 수 있다. 수동 요청의 기존 300초 제한은 유지한다.
- job 선택은 행 잠금과 `SKIP LOCKED`, 저장은 기존 revision/lease/서명 nonce 계약을 사용한다. 60초 지난 RUNNING lease는 회수할 수 있고, 구 lease의 결과는 저장되지 않는다. 최대 시도를 소진한 stale job은 종료해 큐를 막지 않는다.
- 공급자 호출 전과 결과 저장 직전 연결·권한·등록 identity를 다시 확인한다. 연결 해제/변경 중 반환된 결과는 폐기하고 `CANCELLED`로 종료한다. 원본 PUUID는 암호화 저장하며 HTTP 결과에는 넣지 않는다.
- 429는 기존 bounded Retry-After 정책에 따라 재시도하며, 대기 중 다른 계정의 예약·큐 소비도 멈춘다. 마지막 시도의 `FAILED/RATE_LIMITED`도 저장한 `available_at`까지 대기한다. 일시 오류는 기존 backoff, 영구 오류는 종료한다.
- League-v4 조회 후 최근 솔로 최대 20경기를 동시 최대 2개·전체 25초 상한으로 요약한다. 원본 경기 JSON을 저장하지 않는다. 선택적 자료의 누락/실패는 기존 티어 성공을 보존하며, 오래된 솔로 자료를 새 자료처럼 갱신하지 않는다.
- 환경 미설정은 HTTP 200 `UNCONFIGURED`, DB feature 비활성은 200 `DISABLED`, 빈 큐는 200 `IDLE`, 1건 처리 시 200 `PROCESSED`와 안전한 상태만 반환한다. 인증 실패는 401, 예기치 않은 오류는 값 노출 없이 503이다. `PROCESSED`는 성공 여부와 다르므로 `outcome` 및 DB job 결과를 함께 본다.

## 키 진단과 실제 활성화 확인

1. 최신 소스의 전체 통합 검사·배포 ID·환경 적용을 확인하고 운영 DB flag 변경은 기존 감사 경계를 통해 수행한다. 소스 검사 성공을 운영 활성화로 보고하지 않는다.
2. 기존 operations signature 규약으로 빈 JSON `{}`에 대해 `POST /api/internal/jobs/riot-api-probe`를 서명한다. 서명 대상 path, timestamp, body digest, nonce를 일치시키고 새 nonce를 사용한다. 요청에서 URL·회원 ID·추가 옵션을 받지 않는다.
3. 진단은 `https://kr.api.riotgames.com/lol/status/v4/platform-data`에 한 번만 호출한다. timeout 5초, redirect 차단, no-store, 응답 body 폐기, 재시도 없음이다. 상태만 `operations.maintenance_runs(job_name='riot-api-probe')`에 남긴다. 동일 nonce 409, 최근 5분 내 신규 진단 429, DB flag off 403, 실제 실패 503이다.
4. 진단 200은 status-v4 수락만 의미한다. League/Match 실연동 확인은 기존 연결이나 명시적으로 연결에 동의한 소유자 계정으로 수행한다. 임의 회원을 연결하지 않는다. 연결 후 `/account/riot`의 연결 방식이 `DIRECT_OWNER`이고 소유권 확인으로 표시되지 않는지, 큐→성공/부분 성공→요약 시각을 확인한다.
5. 원본 식별자를 출력하지 않는 운영 집계는 `riot.account_links` 상태별 수, `riot.sync_jobs` 상태별 수·최소 요청 시각·시도 수, `riot.summaries` 전체 수/최근 `last_synced_at`/최근 `recent_solo_synced_at`, probe 최신 status/완료 시각만 기록한다. 신규 연결이 없으면 cron `IDLE`과 job 0은 정상이며 전적 실연동 검증 완료로 기록하지 않는다.

문제가 생기면 우선 DB feature flag 또는 환경 flag를 끄고 배포/설정 변경 전 값을 기준으로 복구한다. flag off는 계정을 강제 재연결하거나 job·암호화 키를 삭제하지 않는다. 복구 시 다시 권한과 현재 연결을 검사하므로 만료 lease·해제된 연결의 결과를 그대로 수용하지 않는다. 신규 스키마/migration 변경은 없다.

## 로컬 검증

- `npx tsx --test tests/riot-*.test.ts`: 48/48 PASS, `riot-unit.log`.
- `V2_DB_CONTRACT_SCOPE=riot` 격리 PostgreSQL 18: 기존 Riot 계약, production RSO/nonce, 예약 후보/권한/429, probe 인증/재사용/간격/flag 총 4개 PASS, `riot-db.log`. 실제 공급자 대신 합성 gateway/fetch를 사용한다.
- 담당 ESLint와 `npx tsc --noEmit` 통과. 최종 전체 검사·배포·운영 probe 결과는 총괄 릴리스 증거를 따른다.

회귀는 RSO 없음에도 API 설정 가능, 잘못된 callback RSO 차단, direct method 보존, 6시간 최소 간격, 해제 후 자동 연결 없음, 네트워크 요청 중 해제 결과 폐기, stale exhausted lease 종료, 429 전역대기, 실제 DB eligibility/잠금, probe nonce/빈도/기능 flag를 포함한다.
