# 챔피언 이미지 R14 통합 QA

## 범위

- 기준 브랜치: `fix/kakao-r14-2-2-v1-member-parity-20260909`
- 기준 커밋: `fb44253ab0ca9150023111137cb3e89c7f51fc8e`
- 운영 DB 마이그레이션 `0029`~`0034` 변경 없음
- 대상: 홈 오늘의 챔피언, 공개 경기, 플레이어 상세, 관리자 챔피언 목록

## 확인된 원인

1. 런타임이 존재하지 않는 Data Dragon 버전으로 이미지 URL을 생성했다.
2. 운영 `/api/champions` 첫 페이지의 30개 이미지 URL이 모두 `null`이었다.
3. 홈은 DB 이미지가 없을 때 공통 portrait에 `championKey`를 전달하지 않아 오늘의 챔피언을 공식 이미지로 복구하지 못했다.

## 수정

- 공식 `16.17.1` 한국어 Data Dragon 카탈로그 173개를 고정했다.
- 숫자 Riot key, 공식 영문 id, 한글 이름, 특수 legacy alias를 한 매핑으로 통합했다.
- 공통 후보 순서를 `공식 16.17.1 → 검증된 저장 URL → 문자 폴백`으로 고정했다.
- 클라이언트 이미지 오류 시 다음 후보로 전환하며, 모두 실패해도 같은 크기의 문자 폴백을 유지한다.
- 홈 hero는 DB `image_url`과 관계없이 공통 portrait 한 개를 항상 렌더링하고 `championKey`를 전달한다.
- 경기·플레이어·관리자 챔피언 표면이 같은 공통 portrait 계약을 사용한다.
- 운영 후속 backfill을 위한 기본 dry-run/apply/rollback 스크립트를 추가했다. 기본 실행은 읽기 전용이다.

## 검증 증거

| 검증 | 결과 |
|---|---|
| TypeScript | 통과 |
| ESLint | 오류 0, 기존 경고 25 |
| 계약 테스트 | 221/221 통과 |
| 단위 테스트 | 490/490 통과 |
| Next.js production build | 91/91 페이지 통과 |
| Riot CDN 실제 GET·PNG decode | 173/173 HTTP 200, 173/173 PNG decode, broken 0 |
| PostgreSQL 18 champion scope | 2/2 통과 |
| DB NULL backfill/replay/rollback | 173/173 적용 및 173/173 NULL 복원 통과 |
| 로컬 production 브라우저 | 홈에서 `아리 챔피언` 이미지와 `Riot Data Dragon` 표기 확인 |

실행 명령:

```text
npm run typecheck
npm run lint -- --quiet
npm run test:contracts
npm run test:unit
npm run verify:champion-images
$env:V2_DB_CONTRACT_SCOPE='champions'; npm run test:db
npm run build
```

## 배포 상태와 남은 게이트

- 소스 수정 및 로컬 검증: 완료
- 운영 DB 변경: 하지 않음
- 운영 배포: 하지 않음
- 운영 반영 후 필수: Production 홈·실제 오늘의 챔피언·경기·플레이어·관리자 목록 브라우저 확인, 콘솔/네트워크 broken image 0 확인
- DB backfill은 먼저 `npm run db:champion-images` dry-run 결과가 173개 모두 매핑됨을 확인하고, 별도 백업 경로와 `--confirm-version=16.17.1`을 제공한 승인된 운영 절차에서만 실행한다.

## DB/ops 체크섬과 rollback

- 새 Drizzle migration: 없음. 기존 head `0034_kakao_room_capability_profiles.sql`을 변경하지 않았다.
- `0034` SHA-256: `FA7B4A9DB12B67C3AC9C9877D1631831C6F88AFE56194D6AAEFCE05622A2DDF8`
- backfill runner SHA-256: `03E13121C8FC8149379860ED95C8ECE3F7FD5FDF606508C5B0A6A0260EF91296`
- catalog SHA-256: `DC26B1DB0DD2D95A92BDBEB2A91481C8996CFBB75B9DB339E98D71BFF3FDD041`
- CDN verifier SHA-256: `10C7C4577D3B82C37655CFC6BFA3476583A09F6DA90729DE9FB4EA14F5BCB6E1`
- 운영 dry-run은 운영 비밀정보를 읽지 않는 원칙 때문에 이 작업에서 실행하지 않았다. ops가 운영 환경에서 `npm run db:champion-images`로 읽기 전용 결과를 먼저 저장해야 한다.
- apply는 `npm run db:champion-images -- --apply --backup-file=<새 JSON 경로> --confirm-version=16.17.1`에서만 허용된다. 기존 파일 덮어쓰기는 거부한다.
- rollback은 apply가 생성한 같은 백업으로 `npm run db:champion-images -- --rollback=<백업 JSON 경로> --confirm-version=16.17.1`을 실행한다. 현재값이 backfill 값과 일치하지 않으면 중단하여 후속 변경을 덮지 않는다.

## 근거 있는 다음 패치 추천

1. Data Dragon `versions.json`을 배포 파이프라인에서 조회하고 고정 버전 173개 전체를 사전 검증한다.
2. 운영 DB backfill 후 `/api/champions`의 `imageUrl null` 비율을 0으로 모니터링한다.
3. 홈 hero에 저해상도 정사각 아이콘을 확대할 때의 크롭 품질을 별도 대형 splash 자산과 비교 검토한다.
4. 브라우저 RUM에 이미지 후보 실패 횟수만 비식별 집계하여 CDN 장애를 빠르게 탐지한다.
