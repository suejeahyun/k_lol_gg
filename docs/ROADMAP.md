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

S00~S13은 현재 공유 worktree의 구현 후보로 통합됐다. S14에서 최종 `npm run check`의 contracts 347/347·unit 707 pass·1 intentional skip·build 92 app routes, `npm run test:db`의 migration 37개·head `0036_flowery_hairball`·Kakao V4 P0 31/31·recovery archive, `verify:auth-http`, 현재 트리 비밀정보 검사, Data Dragon 173종/346자산과 여성 홈 가이드 68/68을 확인했다. 로컬 production 서버의 공개 자동 품질은 30/30과 axe 위반 0을 확인했고, 전체 높이 캡처는 27/30 PASS·`/competitions` 3조건 BLOCKED다.

운영 Neon production은 비밀값 비노출 preflight와 1일 복구 분기 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다. 사후 migration 37개와 head hash, unique index 3개, validated foreign key 1개, 중복·mismatch 0을 확인했다.

아직 남은 S14 조건은 릴리스 commit·tag·registry·앱 deployment ID 확정, 운영 앱 배포와 smoke, 격리 DB·합성 세션 기반 `/competitions` 및 현재 103개 화면 335대상 회귀 캡처다. 운영 DB 적용만 확인됐고 앱 배포 근거가 없으므로 현재 기능을 운영 반영 완료로 판정하지 않는다. 운영 Vercel 전환은 별도 승인·배포 절차의 범위다.
