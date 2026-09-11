# V2 구현 로드맵

| 순서 | 슬라이스 | 핵심 산출물 |
|---:|---|---|
| S00 | 기반 | 독립 저장소, 디자인 토큰, 반응형 셸, CI, 오류 규약 |
| S01 | 인증·권한 | 회원가입, 승인, 세션, USER/ADMIN/SUPER_ADMIN, TOTP |
| S02 | 플레이어 등록부 | 검색, 목록, 프로필, 관리자 CRUD |
| S03 | 시즌·참가 | 시즌 상태, 신청·수정·취소, 승인 |
| S04 | 경기·결과 | 목록, 상세, 세트, 참가자, 결과 접수·등록 |
| S05 | 통계·랭킹 | 시즌 통계, 최근 기록, 랭킹, 재계산 |
| S06 | 팀 도구 | 랜덤 팀, 동전 던지기, 밸런스·드래프트 |
| S07 | 이벤트전 | 모집, 팀, 대진, 결과, 완료 |
| S08 | 멸망전 | 신청, 경매, 예선, 본선, 교체, MVP, 갤러리 |
| S09 | 구인·Kakao | 구인, 스크림, 입력·수정·마감, 멱등성 |
| S10 | 미디어 | 하이라이트, 이미지, 홈 노출, 비공개 자료 |
| S11 | 징계 | 기록, 과제, 증거, 검토, 해제, 감사 |
| S12 | Riot | 계정 연결, RSO, 동기화, 재시도 |
| S13 | 운영 | 관리자 대시보드, 설정, 로그, 백업, Cron |
| S14 | 최종 검증 | PWA, 전체 기능 동등성, DB/HTTP/브라우저·접근성·성능·보안·복구, 비밀정보 검사, Git push |

각 슬라이스는 사용자 기능과 같은 영역의 관리자 기능을 함께 완성한다.

S00~S13은 현재 소스에 통합됐다. S14에서 최종 `npm run check`의 contracts 347/347·unit 707 pass·1 intentional skip·build 92 app routes, `npm run test:db`의 migration 37개·head `0036_flowery_hairball`·Kakao V4 P0 31/31·recovery archive, `verify:auth-http`, 현재 트리 비밀정보 검사, Data Dragon 173종/346자산과 여성 홈 가이드 68/68을 확인했다. 운영 별칭의 공개 자동 품질은 30/30·issues 0·axe 위반 0이고 health는 `ready`다. 로컬 전체 높이 캡처는 27/30 PASS·`/competitions` 3조건 BLOCKED로 별도 유지한다.

운영 Neon production은 비밀값 비노출 preflight와 1일 복구 분기 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다. 사후 migration 37개와 head hash, unique index 3개, validated foreign key 1개, 중복·mismatch 0을 확인했다.

최종 기능 commit `8ee4fa4455cf98f0ada62f6ad31d8d45dacc23c4`, tag `v2-v1-team-balance-v1.0.1`, Vercel deployment `dpl_4BzqPTPUWTVmzmXui1sSVcrzreKC`와 운영 별칭을 연결했다. 이 근거 범위에서 V1 팀 밸런스·결과 공유의 운영 반영을 확인했다.

남은 S14 조건은 로그인·관리자 포함 103개 페이지 335회 실캡처, 실제 휴대폰 Kakao 두 방 E2E, 실제 사용자 Riot RSO·Blob E2E다. V1 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없어 명시적 0/미제공 경로를 유지한다. 이 범위를 확인하지 않고 V2 전체 기능이나 외부 연동 전부가 검증됐다고 판정하지 않는다.
