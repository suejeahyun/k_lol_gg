# V2 세부 요구사항 패치 검증

## 판정

- 상태: 소스 구현 및 로컬 검증 완료
- 운영 반영: 미수행
- Git 커밋·푸시: 미수행
- 데이터: 임시 PostgreSQL에서 마이그레이션과 전체 DB 계약을 검증했으며 운영 DB는 변경하지 않음
- 화면: 변경 범위 15개 화면을 데스크톱·모바일로 캡처했고 모두 HTTP 200, 가로 넘침 없음, 자동 점검 이슈 없음

세부 요구사항별 결과는 [REQUIREMENTS_MATRIX.md](./REQUIREMENTS_MATRIX.md), 명령 실행 결과는 [COMMAND_RESULTS.md](./COMMAND_RESULTS.md), 화면 목록은 [screenshots/README.md](./screenshots/README.md), 사용자 공지는 [DISCORD_NOTICE.md](./DISCORD_NOTICE.md)에 정리했다.

## 검수 메모

- 팀 밸런스는 V1에서 익숙했던 `자동 추천 후보 비교`와 `수동 배치` 흐름을 되살리고, 저장·재평가·소유권 검증은 V2 서버 계약을 유지했다.
- 포지션 입력은 셀렉트 대신 누를 수 있는 버튼으로 바꾸고 `aria-pressed`, 키보드 조작, 전체 포지션 자동 배치를 지원한다.
- 캡처용 합성 챔피언은 이미지 URL이 없어서 이름 첫 글자 대체 UI가 표시된다. V1 이관 시에는 허용된 Data Dragon URL을 `champion_catalog.image_url`로 보존하며, 외부 임의 URL은 렌더링하지 않는다.
- 전체 테스트에서 사용하는 합성 데이터 때문에 빈 랭킹·빈 징계 상태도 함께 확인됐다. 데이터가 없는 경우의 안내 상태가 깨지지 않는다는 근거이며, 운영 데이터의 실제 표시 여부는 배포 전 복제 DB 점검이 남아 있다.

## 주요 구현 위치

- 팀 도구: `src/app/(public)/(tools)/tools/`
- 홈·랭킹·안내 챔피언: `src/app/(public)/(home)/page.tsx`, `src/modules/home/`
- 플레이어 검색·티어: `src/app/(public)/(registry)/players/`, `src/modules/players/`
- 경기·챔피언 이미지·초안 출처: `src/app/(public)/(matches)/`, `src/modules/matches/`
- 계정 활동·징계·증빙: `src/app/(public)/account/`, `src/modules/accounts/`, `src/modules/discipline/`
- 이벤트전·멸망전: `src/app/(public)/(competitions)/competitions/`
- 이미지 URL 스키마: `drizzle/0025_s10_champion_image_urls.sql`

## 남은 운영 위험

1. 운영 V1 DB를 대상으로 한 실제 이관 rehearsal은 하지 않았다.
2. 실제 Riot·카카오·Vercel 외부 연동은 로컬 합성 환경으로 대체했으므로 배포 전 별도 smoke test가 필요하다.
3. 신규 챔피언이 V1 이관 이후 추가될 때 이미지 URL을 자동 동기화하는 운영 작업은 아직 없다.

