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

S00~S13은 소스에 통합됐다. 아래 수치와 배포는 최초 S14 검증 시점의 기록이며 현재 페이지 수·migration head·최신 운영 상태가 아니다. 현재 상태는 [STATUS](STATUS.md)와 [릴리스 등록부](releases/registry.json)를 따른다. 최초 S14 `npm run check`는 contracts 347/347·unit 707 pass·1 intentional skip·build 92 app routes, `npm run test:db`는 migration 37개·head `0036_flowery_hairball`·Kakao V4 P0 31/31·recovery archive를 확인했다. 당시 운영 별칭의 공개 자동 품질은 30/30·issues 0·axe 위반 0이었다.

운영 Neon production은 비밀값 비노출 preflight와 1일 복구 분기 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다. 사후 migration 37개와 head hash, unique index 3개, validated foreign key 1개, 중복·mismatch 0을 확인했다.

최종 기능 commit `8ee4fa4455cf98f0ada62f6ad31d8d45dacc23c4`, tag `v2-v1-team-balance-v1.0.1`, Vercel deployment `dpl_4BzqPTPUWTVmzmXui1sSVcrzreKC`와 운영 별칭을 연결했다. 이 근거 범위에서 V1 팀 밸런스·결과 공유의 운영 반영을 확인했다.

최근 솔로 최대 20경기 요약과 관리자 팀 편성 보정은 이제 V2에 구현되어 있다. 일반 관리자 편집은 [10/09 운영 반영](qa-evidence/team-balance-admin-2026-10-08/production.md)을 확인했다. 없는 값·오래된 최근 요약만 0/미제공으로 처리한다. MMR V2 전환도 [10/08 완료 기록](qa-evidence/service-completion-final-2026-10-08/mmr-transition.md)을 따르며 다시 미완료로 분류하지 않는다.

남은 외부 조건은 실제 휴대폰 Kakao 방 수신·절전 복구, Riot RSO 승인·소유자 동의, 운영 인증 화면 재확인, 실제 OS 설치·보조기술·OCR 정확도·장시간 부하, provider PITR·Blob 전체복원이다. [최신 전체 검증 원장](qa-evidence/service-completion-final-2026-10-08/README.md)에서 격리 검증과 운영·실기기 검증을 구분한다. 과거 전체 캡처 건수를 현재 미완료 작업량으로 재사용하거나 모든 외부 연동이 검증됐다고 판정하지 않는다.
