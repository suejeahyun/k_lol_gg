# K-LOL.GG 프로젝트 기능 검수 리포트

> 이 문서는 `npm run audit:project` 실행 결과입니다. 기능의 목적, 예상값, 연결 경로, 검토 플래그를 빠르게 확인하기 위한 1차 감사 자료입니다.

## 1. 요약

| 항목 | 값 |
| --- | --- |
| 생성 시각 | 2026-06-23T06:58:21.991Z |
| 페이지 route | 130 |
| API route | 156 |
| Prisma model | 68 |
| 카카오톡 봇 기대 endpoint | 9 |
| 카카오톡 endpoint 누락 | 0 |
| API 검토 플래그 | 143 |
| 삭제/정리 후보 | 7 |

## 2. 기능 그룹별 목적 / 정상 기준

| 기능 그룹 | 목적 | API | Page | Model | 정상 기준 |
| --- | --- | --- | --- | --- | --- |
| 인증/계정 | 승인된 유저만 민감 기능을 사용하도록 로그인·권한·계정 연결을 관리 | 37 | 20 | 10 | 미로그인 401/리다이렉트, 승인 유저 정상 접근, 관리자 권한 분리 |
| 플레이어 | 내전 참가자의 기본 정보, 티어, 라인, 상세 전적을 관리 | 17 | 16 | 10 | 검색 결과/상세/티어/라인/계정 연결값이 DB와 일치 |
| 내전/경기 | 내전 등록, 참가자, 세트, 승패, KDA 기록을 저장하고 조회 | 23 | 14 | 15 | 등록 후 목록·상세·플레이어 최근 경기·통계에 일관 반영 |
| 시즌/통계/랭킹 | 시즌별 승률, 참여 수, KDA, Top3 등 운영 지표 산출 | 19 | 5 | 5 | 시즌 필터 기준으로 승/패/참여/KDA 산식이 일치 |
| 팀 밸런스/밴픽 | 참가자 티어/포지션/기록을 기준으로 팀 구성 및 밴픽 추천 | 19 | 20 | 5 | 참가자 수, 라인, 티어 가중치, 저장/불러오기 결과가 일치 |
| 구인구직/카카오톡 | 카카오톡 명령어와 양식을 사이트 DB에 반영하고 현황을 반환 | 23 | 13 | 9 | 봇 명령어가 2xx JSON reply를 받고 DB 상태가 중복 없이 반영 |
| 디스코드 운영 | 음성방 접속, 출석, 지각, 자동마감, 운영 로그를 사이트와 연동 | 17 | 9 | 13 | VOICE JOIN/LEAVE, 출석/지각/마감 후보가 실제 음성방 상태와 일치 |
| 관리자 | 운영자가 유저, 시즌, 내전, 구인, 디스코드 상태를 관리 | 47 | 69 | 2 | 관리자 외 접근 차단, 등록/수정/삭제 후 화면과 DB 상태 일치 |
| 공지/커뮤니티/하이라이트 | 유저 공지, 게시글, 이미지/영상 콘텐츠 표시 및 관리 | 21 | 30 | 10 | 승인/비공개/조회/좋아요/첨부 표시 기준 일치 |
| 멸망전/경매 | 이벤트성 경매/토너먼트 진행 및 공개 화면 제공 | 15 | 9 | 6 | 참가자/티어/추첨/경매 단계가 중복 없이 자연스럽게 진행 |
| 모바일 APP | 모바일 전용 화면에서 핵심 기능을 빠르게 제공 | 0 | 15 | 0 | PC 화면으로 이탈하지 않고 app 전용 라우트에서 기능 완료 |

## 3. 카카오톡 봇 코드 ↔ 웹 API 매핑

| 상태 | 봇 상수 | 웹 API | 대표 명령/양식 | 파일 |
| --- | --- | --- | --- | --- |
| OK | OPENCHAT_API_URL | /api/kakao/openchat | 최근 닉네임#태그, 랭킹 | src/app/api/kakao/openchat/route.ts |
| OK | SEARCH_PLAYER_API_URL | /api/kakao/search-player | 전적 닉네임#태그 | src/app/api/kakao/search-player/route.ts |
| OK | RECRUIT_API_URL | /api/kakao/recruit/season-apply | 내전 양식 자동등록, 오늘내전초기화 | src/app/api/kakao/recruit/season-apply/route.ts |
| OK | SEASON_RECRUIT_STATUS_API_URL | /api/kakao/recruit/season-apply/status | 내전현황, AI공지 | src/app/api/kakao/recruit/season-apply/status/route.ts |
| OK | PARTY_RECRUIT_CREATE_API_URL | /api/kakao/party-recruits/create | /2인파티, /5인파티, 칼바람구인 | src/app/api/kakao/party-recruits/create/route.ts |
| OK | PARTY_RECRUIT_SYNC_API_URL | /api/kakao/party-recruits/sync | 구인 양식 복사/수정 반영 | src/app/api/kakao/party-recruits/sync/route.ts |
| OK | PARTY_RECRUIT_FINISH_API_URL | /api/kakao/party-recruits/finish | 13ㅉ, 구인마감 13 | src/app/api/kakao/party-recruits/finish/route.ts |
| OK | PARTY_RECRUIT_STATUS_API_URL | /api/kakao/party-recruits/status | 구인현황, 구인상세 13 | src/app/api/kakao/party-recruits/status/route.ts |
| OK | OPERATION_FORM_API_URL | /api/kakao/operation-forms | 지인/건의/모임/외출 양식 접수 | src/app/api/kakao/operation-forms/route.ts |

## 4. API 검토 플래그

| API | Method | 파일 | 검토 플래그 | 목적 |
| --- | --- | --- | --- | --- |
| /api/account/discord/unlink | POST | src/app/api/account/discord/unlink/route.ts | SERVER_LOG_REVIEW | 디스코드 봇/음성방/출석/운영 상태 연동 처리 |
| /api/admin/backup/balance-ai.csv | GET | src/app/api/admin/backup/balance-ai.csv/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/backup/matches.csv | GET | src/app/api/admin/backup/matches.csv/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/backup/mmr.csv | GET | src/app/api/admin/backup/mmr.csv/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/backup/players.csv | GET | src/app/api/admin/backup/players.csv/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/balance-ai/reviews/[reviewId] | GET | src/app/api/admin/balance-ai/reviews/[reviewId]/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/balance/recommendations/train | POST | src/app/api/admin/balance/recommendations/train/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/community/suggestions/[postId] | PATCH | src/app/api/admin/community/suggestions/[postId]/route.ts | ADMIN_API_AUTH_REVIEW, MUTATION_AUTH_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/dashboard | GET | src/app/api/admin/dashboard/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/destruction-tournaments/[tournamentId]/applications/[applicationId]/status | PATCH | src/app/api/admin/destruction-tournaments/[tournamentId]/applications/[applicationId]/status/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/destruction-tournaments/[tournamentId]/import-participants | POST | src/app/api/admin/destruction-tournaments/[tournamentId]/import-participants/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/event-matches/[eventId]/import-participants | POST | src/app/api/admin/event-matches/[eventId]/import-participants/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/event-matches/[eventId]/participants | POST | src/app/api/admin/event-matches/[eventId]/participants/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/event-matches/[eventId]/participants/[participantId]/delete | POST | src/app/api/admin/event-matches/[eventId]/participants/[participantId]/delete/route.ts | PAGINATION_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/login | POST | src/app/api/admin/login/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/logout | POST | src/app/api/admin/logout/route.ts | ADMIN_API_AUTH_REVIEW, MUTATION_AUTH_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/operation-forms/[formType]/[id] | DELETE, PATCH | src/app/api/admin/operation-forms/[formType]/[id]/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/players/[playerId]/password-reset | PATCH | src/app/api/admin/players/[playerId]/password-reset/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/recruits/auto-finish-settings | GET, POST | src/app/api/admin/recruits/auto-finish-settings/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/recruits/auto-reset-settings | GET, POST | src/app/api/admin/recruits/auto-reset-settings/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/recruits/reset-all | POST | src/app/api/admin/recruits/reset-all/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/recruits/reset-number | POST | src/app/api/admin/recruits/reset-number/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/season-participation-applies | GET | src/app/api/admin/season-participation-applies/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/stats/consistency | GET | src/app/api/admin/stats/consistency/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/stats/recalculate | POST | src/app/api/admin/stats/recalculate/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/users | GET | src/app/api/admin/users/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/users/[userAccountId]/approve | PATCH | src/app/api/admin/users/[userAccountId]/approve/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/users/[userAccountId]/discord-unlink | PATCH | src/app/api/admin/users/[userAccountId]/discord-unlink/route.ts | SERVER_LOG_REVIEW | 디스코드 봇/음성방/출석/운영 상태 연동 처리 |
| /api/admin/users/[userAccountId]/password-reset | PATCH | src/app/api/admin/users/[userAccountId]/password-reset/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/users/[userAccountId]/reject | PATCH | src/app/api/admin/users/[userAccountId]/reject/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/users/[userAccountId]/reset | PATCH | src/app/api/admin/users/[userAccountId]/reset/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/admin/users/[userAccountId]/role | PATCH | src/app/api/admin/users/[userAccountId]/role/route.ts | SERVER_LOG_REVIEW | 관리자 전용 데이터 조회/수정 |
| /api/auth/discord/callback | GET | src/app/api/auth/discord/callback/route.ts | SERVER_LOG_REVIEW | 디스코드 봇/음성방/출석/운영 상태 연동 처리 |
| /api/auth/login | POST | src/app/api/auth/login/route.ts | SERVER_LOG_REVIEW | 로그인, 계정, 인증 상태 처리 |
| /api/auth/me | GET | src/app/api/auth/me/route.ts | SERVER_LOG_REVIEW | 로그인, 계정, 인증 상태 처리 |
| /api/auth/password | PATCH | src/app/api/auth/password/route.ts | SERVER_LOG_REVIEW | 로그인, 계정, 인증 상태 처리 |
| /api/auth/password/forgot | PATCH | src/app/api/auth/password/forgot/route.ts | SERVER_LOG_REVIEW | 로그인, 계정, 인증 상태 처리 |
| /api/auth/signup | POST | src/app/api/auth/signup/route.ts | SERVER_LOG_REVIEW | 로그인, 계정, 인증 상태 처리 |
| /api/champions | GET, POST | src/app/api/champions/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/champions/[championId] | DELETE, GET, PATCH | src/app/api/champions/[championId]/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/community/comments/[commentId] | DELETE | src/app/api/community/comments/[commentId]/route.ts | MUTATION_AUTH_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/headlines | GET | src/app/api/community/headlines/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/my-activity | GET | src/app/api/community/my-activity/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/posts | GET, POST | src/app/api/community/posts/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/posts/[postId] | DELETE, PATCH | src/app/api/community/posts/[postId]/route.ts | MUTATION_AUTH_REVIEW, SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/posts/[postId]/comments | POST | src/app/api/community/posts/[postId]/comments/route.ts | MUTATION_AUTH_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/posts/[postId]/like | POST | src/app/api/community/posts/[postId]/like/route.ts | MUTATION_AUTH_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/community/visits | GET, POST | src/app/api/community/visits/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/destruction-tournaments | GET, POST | src/app/api/destruction-tournaments/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId] | DELETE, GET, PATCH | src/app/api/destruction-tournaments/[tournamentId]/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/assign-teams | PUT | src/app/api/destruction-tournaments/[tournamentId]/assign-teams/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/auction/draw | POST | src/app/api/destruction-tournaments/[tournamentId]/auction/draw/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/auction/resolve | PATCH | src/app/api/destruction-tournaments/[tournamentId]/auction/resolve/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/complete | PATCH | src/app/api/destruction-tournaments/[tournamentId]/complete/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/final | POST | src/app/api/destruction-tournaments/[tournamentId]/final/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/matches/[matchId]/result | PATCH | src/app/api/destruction-tournaments/[tournamentId]/matches/[matchId]/result/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/destruction-tournaments/[tournamentId]/participants | PUT | src/app/api/destruction-tournaments/[tournamentId]/participants/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/preliminary | POST | src/app/api/destruction-tournaments/[tournamentId]/preliminary/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/teams | POST | src/app/api/destruction-tournaments/[tournamentId]/teams/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/destruction-tournaments/[tournamentId]/tournament | POST | src/app/api/destruction-tournaments/[tournamentId]/tournament/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/discord/heartbeat | POST | src/app/api/discord/heartbeat/route.ts | SERVER_LOG_REVIEW | 디스코드 봇/음성방/출석/운영 상태 연동 처리 |
| /api/discord/operation-log | POST | src/app/api/discord/operation-log/route.ts | SERVER_LOG_REVIEW | 디스코드 봇/음성방/출석/운영 상태 연동 처리 |
| /api/event-matches | GET, POST | src/app/api/event-matches/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId] | DELETE, GET, PATCH | src/app/api/event-matches/[eventId]/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId]/bracket | POST | src/app/api/event-matches/[eventId]/bracket/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId]/complete | PATCH | src/app/api/event-matches/[eventId]/complete/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId]/matches/[matchId]/result | PATCH | src/app/api/event-matches/[eventId]/matches/[matchId]/result/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId]/participants | PUT | src/app/api/event-matches/[eventId]/participants/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId]/result | PATCH | src/app/api/event-matches/[eventId]/result/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/[eventId]/teams | - | src/app/api/event-matches/[eventId]/teams/route.ts | NO_EXPORTED_HTTP_METHOD | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-matches/balance | POST | src/app/api/event-matches/balance/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/event-notices | GET, POST | src/app/api/event-notices/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/event-notices/[eventNoticeId] | DELETE, GET, PATCH | src/app/api/event-notices/[eventNoticeId]/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/gallery-images/[imageId]/home-display | PATCH, POST | src/app/api/gallery-images/[imageId]/home-display/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/highlights | GET, POST | src/app/api/highlights/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/highlights/[highlightId] | DELETE, GET, PATCH | src/app/api/highlights/[highlightId]/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/images | GET, POST | src/app/api/images/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/images/[imageId] | DELETE, GET, PATCH | src/app/api/images/[imageId]/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/kakao/openchat | GET, POST | src/app/api/kakao/openchat/route.ts | SERVER_LOG_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/kakao/operation-forms | POST | src/app/api/kakao/operation-forms/route.ts | SERVER_LOG_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/kakao/party-recruits/reset | POST | src/app/api/kakao/party-recruits/reset/route.ts | KAKAO_SECRET_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/kakao/recruit/season-apply/status | GET, POST | src/app/api/kakao/recruit/season-apply/status/route.ts | PAGINATION_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/kakao/scheduled-notice | GET, POST | src/app/api/kakao/scheduled-notice/route.ts | SERVER_LOG_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/kakao/search-player | GET, POST | src/app/api/kakao/search-player/route.ts | SERVER_LOG_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/kakao/web-player-search | GET | src/app/api/kakao/web-player-search/route.ts | KAKAO_SECRET_REVIEW, SERVER_LOG_REVIEW | 카카오톡 봇 명령/양식/구인구직 연동 처리 |
| /api/logs | GET, POST | src/app/api/logs/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/matches | GET, POST | src/app/api/matches/route.ts | SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/matches/[matchId] | - | src/app/api/matches/[matchId]/route.ts | NO_EXPORTED_HTTP_METHOD | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/matches/import-lol-result | POST | src/app/api/matches/import-lol-result/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 내전 경기 목록, 상세, 등록, 통계 연결 |
| /api/my-player | GET, PATCH | src/app/api/my-player/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/notices | GET, POST | src/app/api/notices/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/notices/[noticeId] | DELETE, GET, PATCH | src/app/api/notices/[noticeId]/route.ts | SERVER_LOG_REVIEW | 공지/커뮤니티/게시글 표시 및 관리 |
| /api/participation | GET | src/app/api/participation/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/participation/destruction/[tournamentId] | DELETE, GET, POST | src/app/api/participation/destruction/[tournamentId]/route.ts | SERVER_LOG_REVIEW | 멸망전/경매/이벤트 진행 화면 및 관리 |
| /api/participation/event/[eventId] | GET, POST | src/app/api/participation/event/[eventId]/route.ts | SERVER_LOG_REVIEW | API 기능 처리 |
| /api/participation/season | DELETE, GET, POST | src/app/api/participation/season/route.ts | SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/players | GET, POST | src/app/api/players/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/players/[playerId] | DELETE, GET, PATCH | src/app/api/players/[playerId]/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/players/balance | POST | src/app/api/players/balance/route.ts | MUTATION_AUTH_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/players/balance/balance-search | GET | src/app/api/players/balance/balance-search/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/players/search | GET | src/app/api/players/search/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/rankings | GET | src/app/api/rankings/route.ts | SERVER_LOG_REVIEW | 랭킹/통계 계산 및 표시 |
| /api/recruits | GET | src/app/api/recruits/route.ts | PAGINATION_REVIEW | 구인구직 생성, 현황, 참가자 관리 |
| /api/riot/player/[playerId]/summary | GET | src/app/api/riot/player/[playerId]/summary/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/riot/player/[playerId]/sync | POST | src/app/api/riot/player/[playerId]/sync/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/riot/player/[playerId]/sync-full | POST | src/app/api/riot/player/[playerId]/sync-full/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/seasons | GET, POST | src/app/api/seasons/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/seasons/[seasonId] | DELETE, PATCH | src/app/api/seasons/[seasonId]/route.ts | SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/seasons/[seasonId]/activate | PATCH | src/app/api/seasons/[seasonId]/activate/route.ts | SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/seasons/[seasonId]/clone | POST | src/app/api/seasons/[seasonId]/clone/route.ts | SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/seasons/[seasonId]/end | PATCH | src/app/api/seasons/[seasonId]/end/route.ts | SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/seasons/current | GET | src/app/api/seasons/current/route.ts | SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |
| /api/stats/player/[playerId]/recent | GET | src/app/api/stats/player/[playerId]/recent/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/stats/player/[playerId]/summary | GET | src/app/api/stats/player/[playerId]/summary/route.ts | SERVER_LOG_REVIEW | 플레이어 검색, 상세, 계정/전적 관리 |
| /api/stats/top | GET | src/app/api/stats/top/route.ts | SERVER_LOG_REVIEW | 랭킹/통계 계산 및 표시 |
| /api/team-balance/drafts | GET, POST | src/app/api/team-balance/drafts/route.ts | SERVER_LOG_REVIEW | 팀 밸런스/밴픽 추천/랜덤팀 편성 |
| /api/team-balance/drafts/[draftId] | GET | src/app/api/team-balance/drafts/[draftId]/route.ts | SERVER_LOG_REVIEW | 팀 밸런스/밴픽 추천/랜덤팀 편성 |
| /api/team-balance/drafts/[draftId]/solo-rank/sync | POST | src/app/api/team-balance/drafts/[draftId]/solo-rank/sync/route.ts | SERVER_LOG_REVIEW | 팀 밸런스/밴픽 추천/랜덤팀 편성 |
| /api/team-balance/drafts/latest | GET | src/app/api/team-balance/drafts/latest/route.ts | SERVER_LOG_REVIEW | 팀 밸런스/밴픽 추천/랜덤팀 편성 |
| /api/team-balance/evaluate | POST | src/app/api/team-balance/evaluate/route.ts | MUTATION_AUTH_REVIEW, SERVER_LOG_REVIEW | 팀 밸런스/밴픽 추천/랜덤팀 편성 |
| /api/team-balance/feedback | POST | src/app/api/team-balance/feedback/route.ts | SERVER_LOG_REVIEW | 팀 밸런스/밴픽 추천/랜덤팀 편성 |
| /api/team-balance/season-applies | GET | src/app/api/team-balance/season-applies/route.ts | PAGINATION_REVIEW, SERVER_LOG_REVIEW | 시즌 생성, 활성화, 시즌 기준 데이터 관리 |

### 플래그 의미

| 플래그 | 의미 |
| --- | --- |
| ADMIN_API_AUTH_REVIEW | 관리자 API로 보이나 권한 확인 코드가 명확하지 않음 |
| DISCORD_API_AUTH_REVIEW | 디스코드 API로 보이나 봇 secret/관리자 권한 확인이 명확하지 않음 |
| KAKAO_SECRET_REVIEW | 카카오 API로 보이나 secret/header 확인이 명확하지 않음 |
| MUTATION_AUTH_REVIEW | 데이터 변경 API인데 인증 신호가 명확하지 않음 |
| PAGINATION_REVIEW | findMany 사용 시 take/pageSize 등 제한 확인 필요 |
| SERVER_LOG_REVIEW | API 내부 console 로그 사용 여부 검토 |
| NO_EXPORTED_HTTP_METHOD | route 파일에 GET/POST 등 HTTP export가 탐지되지 않음 |

## 5. 삭제/정리 후보

| 분류 | 파일 |
| --- | --- |
| ARCHIVE_IN_REPO | all.zip |
| BACKUP_OR_TEMP_NAME | src/app/api/admin/backup/balance-ai.csv/route.ts |
| BACKUP_OR_TEMP_NAME | src/app/api/admin/backup/matches.csv/route.ts |
| BACKUP_OR_TEMP_NAME | src/app/api/admin/backup/mmr.csv/route.ts |
| BACKUP_OR_TEMP_NAME | src/app/api/admin/backup/players.csv/route.ts |
| BACKUP_OR_TEMP_NAME | src/app/api/admin/backup/rankings.csv/route.ts |
| BUILD_CACHE | tsconfig.tsbuildinfo |

## 6. 전체 API 목록

| API | Method | 파일 | 목적 | 예상값 | 인증 신호 |
| --- | --- | --- | --- | --- | --- |
| /api/account/discord/status | GET | src/app/api/account/discord/status/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user |
| /api/account/discord/unlink | POST | src/app/api/account/discord/unlink/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user |
| /api/admin/backup/balance-ai.csv | GET | src/app/api/admin/backup/balance-ai.csv/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/backup/matches.csv | GET | src/app/api/admin/backup/matches.csv/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/backup/mmr.csv | GET | src/app/api/admin/backup/mmr.csv/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/backup/players.csv | GET | src/app/api/admin/backup/players.csv/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/backup/rankings.csv | GET | src/app/api/admin/backup/rankings.csv/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/balance-ai/matches/[matchId]/reanalyze | POST | src/app/api/admin/balance-ai/matches/[matchId]/reanalyze/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/balance-ai/players | GET | src/app/api/admin/balance-ai/players/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/balance-ai/recalculate | POST | src/app/api/admin/balance-ai/recalculate/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/balance-ai/reviews | GET | src/app/api/admin/balance-ai/reviews/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/balance-ai/reviews/[reviewId] | GET | src/app/api/admin/balance-ai/reviews/[reviewId]/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/balance-ai/summary | GET | src/app/api/admin/balance-ai/summary/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/balance/recommendations/train | POST | src/app/api/admin/balance/recommendations/train/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/community/suggestions/[postId] | PATCH | src/app/api/admin/community/suggestions/[postId]/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | 검토 필요 |
| /api/admin/dashboard | GET | src/app/api/admin/dashboard/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/destruction-tournaments/[tournamentId]/applications/[applicationId]/status | PATCH | src/app/api/admin/destruction-tournaments/[tournamentId]/applications/[applicationId]/status/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/destruction-tournaments/[tournamentId]/import-participants | POST | src/app/api/admin/destruction-tournaments/[tournamentId]/import-participants/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/discipline-records | GET, POST | src/app/api/admin/discipline-records/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/discipline-records/[id]/reset | POST | src/app/api/admin/discipline-records/[id]/reset/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/discipline-records/target/reset | POST | src/app/api/admin/discipline-records/target/reset/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/discipline-records/user/[userAccountId]/reset | POST | src/app/api/admin/discipline-records/user/[userAccountId]/reset/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/discord/monitors | GET | src/app/api/admin/discord/monitors/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | requireAdmin, session/user |
| /api/admin/discord/overview | GET | src/app/api/admin/discord/overview/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | requireAdmin, session/user, bearer/secret |
| /api/admin/discord/roles/sync | POST | src/app/api/admin/discord/roles/sync/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | requireAdmin |
| /api/admin/discord/settings | GET, POST | src/app/api/admin/discord/settings/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | requireAdmin |
| /api/admin/event-matches/[eventId]/import-participants | POST | src/app/api/admin/event-matches/[eventId]/import-participants/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/event-matches/[eventId]/participants | POST | src/app/api/admin/event-matches/[eventId]/participants/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/event-matches/[eventId]/participants/[participantId]/delete | POST | src/app/api/admin/event-matches/[eventId]/participants/[participantId]/delete/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/login | POST | src/app/api/admin/login/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | session/user |
| /api/admin/logout | POST | src/app/api/admin/logout/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | 검토 필요 |
| /api/admin/maintenance/rate-limit-cleanup | POST | src/app/api/admin/maintenance/rate-limit-cleanup/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/operation-forms/[formType]/[id] | DELETE, PATCH | src/app/api/admin/operation-forms/[formType]/[id]/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/players/[playerId]/balance-profile | GET | src/app/api/admin/players/[playerId]/balance-profile/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/players/[playerId]/password-reset | PATCH | src/app/api/admin/players/[playerId]/password-reset/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/recruits/auto-finish-settings | GET, POST | src/app/api/admin/recruits/auto-finish-settings/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/recruits/auto-reset-settings | GET, POST | src/app/api/admin/recruits/auto-reset-settings/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/recruits/reset-all | POST | src/app/api/admin/recruits/reset-all/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/recruits/reset-number | POST | src/app/api/admin/recruits/reset-number/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/season-participation-applies | GET | src/app/api/admin/season-participation-applies/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/stats/consistency | GET | src/app/api/admin/stats/consistency/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/stats/recalculate | POST | src/app/api/admin/stats/recalculate/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/users | GET | src/app/api/admin/users/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin, session/user |
| /api/admin/users/[userAccountId]/approve | PATCH | src/app/api/admin/users/[userAccountId]/approve/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/users/[userAccountId]/discord-unlink | PATCH | src/app/api/admin/users/[userAccountId]/discord-unlink/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | requireAdmin, session/user |
| /api/admin/users/[userAccountId]/password-reset | PATCH | src/app/api/admin/users/[userAccountId]/password-reset/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/users/[userAccountId]/reject | PATCH | src/app/api/admin/users/[userAccountId]/reject/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/users/[userAccountId]/reset | PATCH | src/app/api/admin/users/[userAccountId]/reset/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/admin/users/[userAccountId]/role | PATCH | src/app/api/admin/users/[userAccountId]/role/route.ts | 관리자 전용 데이터 조회/수정 | 관리자 인증 성공 시 데이터 반환 또는 변경, 미인증 시 401/403 | requireAdmin |
| /api/auth/discord/callback | GET | src/app/api/auth/discord/callback/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/auth/discord/start | GET | src/app/api/auth/discord/start/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user |
| /api/auth/login | POST | src/app/api/auth/login/route.ts | 로그인, 계정, 인증 상태 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/auth/logout | POST | src/app/api/auth/logout/route.ts | 로그인, 계정, 인증 상태 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/auth/me | GET | src/app/api/auth/me/route.ts | 로그인, 계정, 인증 상태 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/auth/password | PATCH | src/app/api/auth/password/route.ts | 로그인, 계정, 인증 상태 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/auth/password/forgot | PATCH | src/app/api/auth/password/forgot/route.ts | 로그인, 계정, 인증 상태 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/auth/signup | POST | src/app/api/auth/signup/route.ts | 로그인, 계정, 인증 상태 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/champions | GET, POST | src/app/api/champions/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/champions/[championId] | DELETE, GET, PATCH | src/app/api/champions/[championId]/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/community/comments/[commentId] | DELETE | src/app/api/community/comments/[commentId]/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/community/headlines | GET | src/app/api/community/headlines/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/community/mvp-votes | POST | src/app/api/community/mvp-votes/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/community/my-activity | GET | src/app/api/community/my-activity/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/community/posts | GET, POST | src/app/api/community/posts/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/community/posts/[postId] | DELETE, PATCH | src/app/api/community/posts/[postId]/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/community/posts/[postId]/comments | POST | src/app/api/community/posts/[postId]/comments/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/community/posts/[postId]/like | POST | src/app/api/community/posts/[postId]/like/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/community/reports | GET, PATCH, POST | src/app/api/community/reports/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/community/visits | GET, POST | src/app/api/community/visits/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/destruction-tournaments | GET, POST | src/app/api/destruction-tournaments/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/destruction-tournaments/[tournamentId] | DELETE, GET, PATCH | src/app/api/destruction-tournaments/[tournamentId]/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/assign-teams | PUT | src/app/api/destruction-tournaments/[tournamentId]/assign-teams/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/auction/draw | POST | src/app/api/destruction-tournaments/[tournamentId]/auction/draw/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/auction/resolve | PATCH | src/app/api/destruction-tournaments/[tournamentId]/auction/resolve/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/complete | PATCH | src/app/api/destruction-tournaments/[tournamentId]/complete/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/final | POST | src/app/api/destruction-tournaments/[tournamentId]/final/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/matches/[matchId]/result | PATCH | src/app/api/destruction-tournaments/[tournamentId]/matches/[matchId]/result/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/participants | PUT | src/app/api/destruction-tournaments/[tournamentId]/participants/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/preliminary | POST | src/app/api/destruction-tournaments/[tournamentId]/preliminary/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/teams | POST | src/app/api/destruction-tournaments/[tournamentId]/teams/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/destruction-tournaments/[tournamentId]/tournament | POST | src/app/api/destruction-tournaments/[tournamentId]/tournament/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/discord/heartbeat | POST | src/app/api/discord/heartbeat/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/operation-log | POST | src/app/api/discord/operation-log/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/recruits/auto-finish/channels | GET | src/app/api/discord/recruits/auto-finish/channels/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/recruits/auto-finish/check | POST | src/app/api/discord/recruits/auto-finish/check/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/recruits/late-warning/check | POST | src/app/api/discord/recruits/late-warning/check/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/recruits/late-warning/notify-result | POST | src/app/api/discord/recruits/late-warning/notify-result/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/settings | GET | src/app/api/discord/settings/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/discord/voice-state | POST | src/app/api/discord/voice-state/route.ts | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | HTTP 2xx + JSON { ok, ... } / 봇 secret 또는 관리자 권한 검증 / 실패 시 401 또는 403 | session/user, bearer/secret |
| /api/event-matches | GET, POST | src/app/api/event-matches/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId] | DELETE, GET, PATCH | src/app/api/event-matches/[eventId]/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId]/bracket | POST | src/app/api/event-matches/[eventId]/bracket/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId]/complete | PATCH | src/app/api/event-matches/[eventId]/complete/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId]/matches/[matchId]/result | PATCH | src/app/api/event-matches/[eventId]/matches/[matchId]/result/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId]/participants | PUT | src/app/api/event-matches/[eventId]/participants/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId]/result | PATCH | src/app/api/event-matches/[eventId]/result/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-matches/[eventId]/teams | - | src/app/api/event-matches/[eventId]/teams/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | 검토 필요 |
| /api/event-matches/balance | POST | src/app/api/event-matches/balance/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/event-notices | GET, POST | src/app/api/event-notices/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/event-notices/[eventNoticeId] | DELETE, GET, PATCH | src/app/api/event-notices/[eventNoticeId]/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/gallery-images/[imageId]/home-display | PATCH, POST | src/app/api/gallery-images/[imageId]/home-display/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/highlights | GET, POST | src/app/api/highlights/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/highlights/[highlightId] | DELETE, GET, PATCH | src/app/api/highlights/[highlightId]/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/images | GET, POST | src/app/api/images/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/images/[imageId] | DELETE, GET, PATCH | src/app/api/images/[imageId]/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/kakao/openchat | GET, POST | src/app/api/kakao/openchat/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/operation-forms | POST | src/app/api/kakao/operation-forms/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/party-recruits/auto-finish-idle | GET, POST | src/app/api/kakao/party-recruits/auto-finish-idle/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | bearer/secret |
| /api/kakao/party-recruits/create | POST | src/app/api/kakao/party-recruits/create/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/party-recruits/finish | POST | src/app/api/kakao/party-recruits/finish/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/party-recruits/reset | POST | src/app/api/kakao/party-recruits/reset/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | 검토 필요 |
| /api/kakao/party-recruits/status | GET, POST | src/app/api/kakao/party-recruits/status/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/party-recruits/sync | POST | src/app/api/kakao/party-recruits/sync/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/recruit/season-apply | POST | src/app/api/kakao/recruit/season-apply/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/recruit/season-apply/status | GET, POST | src/app/api/kakao/recruit/season-apply/status/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/scheduled-notice | GET, POST | src/app/api/kakao/scheduled-notice/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/search-player | GET, POST | src/app/api/kakao/search-player/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user, bearer/secret |
| /api/kakao/web-player-search | GET | src/app/api/kakao/web-player-search/route.ts | 카카오톡 봇 명령/양식/구인구직 연동 처리 | HTTP 2xx + JSON { ok, reply } 또는 카카오톡에 그대로 보낼 수 있는 text/message | session/user |
| /api/logs | GET, POST | src/app/api/logs/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/matches | GET, POST | src/app/api/matches/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/matches/[matchId] | - | src/app/api/matches/[matchId]/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | 검토 필요 |
| /api/matches/import-lol-result | POST | src/app/api/matches/import-lol-result/route.ts | 내전 경기 목록, 상세, 등록, 통계 연결 | 내전 series/game/participant/winner/team/KDA 등 경기 구조 | requireAdmin, session/user |
| /api/my-player | GET, PATCH | src/app/api/my-player/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/notices | GET, POST | src/app/api/notices/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/notices/[noticeId] | DELETE, GET, PATCH | src/app/api/notices/[noticeId]/route.ts | 공지/커뮤니티/게시글 표시 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/participation | GET | src/app/api/participation/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/participation/destruction/[tournamentId] | DELETE, GET, POST | src/app/api/participation/destruction/[tournamentId]/route.ts | 멸망전/경매/이벤트 진행 화면 및 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/participation/event/[eventId] | GET, POST | src/app/api/participation/event/[eventId]/route.ts | API 기능 처리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/participation/season | DELETE, GET, POST | src/app/api/participation/season/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/players | GET, POST | src/app/api/players/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 플레이어 id/name/nickname/tag/tier/position/stat 등 목적별 필드 | requireAdmin, session/user |
| /api/players/[playerId] | DELETE, GET, PATCH | src/app/api/players/[playerId]/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 플레이어 id/name/nickname/tag/tier/position/stat 등 목적별 필드 | requireAdmin, session/user |
| /api/players/balance | POST | src/app/api/players/balance/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 플레이어 id/name/nickname/tag/tier/position/stat 등 목적별 필드 | 검토 필요 |
| /api/players/balance/balance-search | GET | src/app/api/players/balance/balance-search/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 플레이어 id/name/nickname/tag/tier/position/stat 등 목적별 필드 | session/user |
| /api/players/search | GET | src/app/api/players/search/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 플레이어 id/name/nickname/tag/tier/position/stat 등 목적별 필드 | session/user |
| /api/rankings | GET | src/app/api/rankings/route.ts | 랭킹/통계 계산 및 표시 | 시즌 기준 승률/참여수/KDA/MVP 등 계산값 | session/user |
| /api/recruits | GET | src/app/api/recruits/route.ts | 구인구직 생성, 현황, 참가자 관리 | 구인 번호, 상태, 인원, 시작시간, 보호시간, 참가자 목록 | 검토 필요 |
| /api/riot/player/[playerId]/summary | GET | src/app/api/riot/player/[playerId]/summary/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/riot/player/[playerId]/sync | POST | src/app/api/riot/player/[playerId]/sync/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/riot/player/[playerId]/sync-full | POST | src/app/api/riot/player/[playerId]/sync-full/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/seasons | GET, POST | src/app/api/seasons/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/seasons/[seasonId] | DELETE, PATCH | src/app/api/seasons/[seasonId]/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/seasons/[seasonId]/activate | PATCH | src/app/api/seasons/[seasonId]/activate/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/seasons/[seasonId]/clone | POST | src/app/api/seasons/[seasonId]/clone/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/seasons/[seasonId]/current | GET | src/app/api/seasons/[seasonId]/current/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/seasons/[seasonId]/end | PATCH | src/app/api/seasons/[seasonId]/end/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin, session/user |
| /api/seasons/current | GET | src/app/api/seasons/current/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/stats/player/[playerId]/recent | GET | src/app/api/stats/player/[playerId]/recent/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 시즌 기준 승률/참여수/KDA/MVP 등 계산값 | session/user |
| /api/stats/player/[playerId]/summary | GET | src/app/api/stats/player/[playerId]/summary/route.ts | 플레이어 검색, 상세, 계정/전적 관리 | 시즌 기준 승률/참여수/KDA/MVP 등 계산값 | session/user |
| /api/stats/top | GET | src/app/api/stats/top/route.ts | 랭킹/통계 계산 및 표시 | 시즌 기준 승률/참여수/KDA/MVP 등 계산값 | 검토 필요 |
| /api/team-balance/drafts | GET, POST | src/app/api/team-balance/drafts/route.ts | 팀 밸런스/밴픽 추천/랜덤팀 편성 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/team-balance/drafts/[draftId] | GET | src/app/api/team-balance/drafts/[draftId]/route.ts | 팀 밸런스/밴픽 추천/랜덤팀 편성 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/team-balance/drafts/[draftId]/solo-rank/sync | POST | src/app/api/team-balance/drafts/[draftId]/solo-rank/sync/route.ts | 팀 밸런스/밴픽 추천/랜덤팀 편성 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/team-balance/drafts/latest | GET | src/app/api/team-balance/drafts/latest/route.ts | 팀 밸런스/밴픽 추천/랜덤팀 편성 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |
| /api/team-balance/evaluate | POST | src/app/api/team-balance/evaluate/route.ts | 팀 밸런스/밴픽 추천/랜덤팀 편성 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | 검토 필요 |
| /api/team-balance/feedback | POST | src/app/api/team-balance/feedback/route.ts | 팀 밸런스/밴픽 추천/랜덤팀 편성 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | requireAdmin |
| /api/team-balance/season-applies | GET | src/app/api/team-balance/season-applies/route.ts | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | 요청 성공 여부와 화면/호출부가 기대하는 JSON 구조 | session/user |

## 7. 전체 Page 목록

| Route | 파일 | 목적 | 렌더 유형 |
| --- | --- | --- | --- |
| / | src/app/(user)/page.tsx | 서비스 홈/모바일 홈 | server |
| /account | src/app/(user)/account/page.tsx | 로그인, 계정, 인증 상태 처리 | server |
| /account/password | src/app/(user)/account/password/page.tsx | 로그인, 계정, 인증 상태 처리 | server |
| /admin | src/app/(admin)/admin/page.tsx | 관리자 운영 화면 | client |
| /admin/balance | src/app/(admin)/admin/balance/page.tsx | 관리자 운영 화면 | server |
| /admin/balance-ai | src/app/(admin)/admin/balance-ai/page.tsx | 관리자 운영 화면 | server |
| /admin/balance-ai/players | src/app/(admin)/admin/balance-ai/players/page.tsx | 관리자 운영 화면 | server |
| /admin/balance-ai/recalculate | src/app/(admin)/admin/balance-ai/recalculate/page.tsx | 관리자 운영 화면 | server |
| /admin/balance-ai/reviews | src/app/(admin)/admin/balance-ai/reviews/page.tsx | 관리자 운영 화면 | server |
| /admin/balance-ai/reviews/[reviewId] | src/app/(admin)/admin/balance-ai/reviews/[reviewId]/page.tsx | 관리자 운영 화면 | server |
| /admin/balance/drafts | src/app/(admin)/admin/balance/drafts/page.tsx | 관리자 운영 화면 | server |
| /admin/balance/drafts/[draftId] | src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx | 관리자 운영 화면 | server |
| /admin/balance/drafts/[draftId]/recommendations | src/app/(admin)/admin/balance/drafts/[draftId]/recommendations/page.tsx | 관리자 운영 화면 | server |
| /admin/balance/recommendations | src/app/(admin)/admin/balance/recommendations/page.tsx | 관리자 운영 화면 | server |
| /admin/champions | src/app/(admin)/admin/champions/page.tsx | 관리자 운영 화면 | client |
| /admin/champions/[championId]/edit | src/app/(admin)/admin/champions/[championId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/champions/new | src/app/(admin)/admin/champions/new/page.tsx | 관리자 운영 화면 | client |
| /admin/community | src/app/(admin)/admin/community/page.tsx | 관리자 운영 화면 | server |
| /admin/community/headlines | src/app/(admin)/admin/community/headlines/page.tsx | 관리자 운영 화면 | server |
| /admin/discord | src/app/(admin)/admin/discord/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | server |
| /admin/discord-monitor | src/app/(admin)/admin/discord-monitor/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | server |
| /admin/discord/diagnostics | src/app/(admin)/admin/discord/diagnostics/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | client |
| /admin/discord/logs | src/app/(admin)/admin/discord/logs/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | server |
| /admin/discord/matches | src/app/(admin)/admin/discord/matches/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | client |
| /admin/discord/recruits | src/app/(admin)/admin/discord/recruits/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | client |
| /admin/discord/settings | src/app/(admin)/admin/discord/settings/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | client |
| /admin/discord/stats | src/app/(admin)/admin/discord/stats/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | server |
| /admin/event-notices | src/app/(admin)/admin/event-notices/page.tsx | 관리자 운영 화면 | server |
| /admin/event-notices/[eventNoticeId]/edit | src/app/(admin)/admin/event-notices/[eventNoticeId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/event-notices/new | src/app/(admin)/admin/event-notices/new/page.tsx | 관리자 운영 화면 | server |
| /admin/highlights | src/app/(admin)/admin/highlights/page.tsx | 관리자 운영 화면 | server |
| /admin/highlights/[highlightId]/edit | src/app/(admin)/admin/highlights/[highlightId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/highlights/new | src/app/(admin)/admin/highlights/new/page.tsx | 관리자 운영 화면 | server |
| /admin/images | src/app/(admin)/admin/images/page.tsx | 관리자 운영 화면 | server |
| /admin/images/[imageId]/edit | src/app/(admin)/admin/images/[imageId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/images/new | src/app/(admin)/admin/images/new/page.tsx | 관리자 운영 화면 | server |
| /admin/login | src/app/(admin)/admin/login/page.tsx | 관리자 운영 화면 | client |
| /admin/logs | src/app/(admin)/admin/logs/page.tsx | 관리자 운영 화면 | server |
| /admin/matches | src/app/(admin)/admin/matches/page.tsx | 관리자 운영 화면 | server |
| /admin/matches/[matchId]/ai-review | src/app/(admin)/admin/matches/[matchId]/ai-review/page.tsx | 관리자 운영 화면 | server |
| /admin/matches/[matchId]/edit | src/app/(admin)/admin/matches/[matchId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/matches/new | src/app/(admin)/admin/matches/new/page.tsx | 관리자 운영 화면 | server |
| /admin/notices | src/app/(admin)/admin/notices/page.tsx | 관리자 운영 화면 | server |
| /admin/notices/[noticeId]/edit | src/app/(admin)/admin/notices/[noticeId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/notices/new | src/app/(admin)/admin/notices/new/page.tsx | 관리자 운영 화면 | server |
| /admin/operation-forms | src/app/(admin)/admin/operation-forms/page.tsx | 관리자 운영 화면 | server |
| /admin/operation-forms/friends | src/app/(admin)/admin/operation-forms/friends/page.tsx | 관리자 운영 화면 | server |
| /admin/operation-forms/leaves | src/app/(admin)/admin/operation-forms/leaves/page.tsx | 관리자 운영 화면 | server |
| /admin/operation-forms/meetups | src/app/(admin)/admin/operation-forms/meetups/page.tsx | 관리자 운영 화면 | server |
| /admin/operation-forms/suggestions | src/app/(admin)/admin/operation-forms/suggestions/page.tsx | 관리자 운영 화면 | server |
| /admin/operation-forms/warnings | src/app/(admin)/admin/operation-forms/warnings/page.tsx | 관리자 운영 화면 | server |
| /admin/player-approvals | src/app/(admin)/admin/player-approvals/page.tsx | 관리자 운영 화면 | server |
| /admin/players | src/app/(admin)/admin/players/page.tsx | 관리자 운영 화면 | client |
| /admin/players/[playerId]/balance | src/app/(admin)/admin/players/[playerId]/balance/page.tsx | 관리자 운영 화면 | server |
| /admin/players/[playerId]/edit | src/app/(admin)/admin/players/[playerId]/edit/page.tsx | 관리자 운영 화면 | server |
| /admin/progress | src/app/(admin)/admin/progress/page.tsx | 관리자 운영 화면 | server |
| /admin/progress/destruction | src/app/(admin)/admin/progress/destruction/page.tsx | 관리자 운영 화면 | server |
| /admin/progress/destruction/[tournamentId] | src/app/(admin)/admin/progress/destruction/[tournamentId]/page.tsx | 관리자 운영 화면 | server |
| /admin/progress/destruction/new | src/app/(admin)/admin/progress/destruction/new/page.tsx | 관리자 운영 화면 | client |
| /admin/progress/event | src/app/(admin)/admin/progress/event/page.tsx | 관리자 운영 화면 | server |
| /admin/progress/event/[eventId] | src/app/(admin)/admin/progress/event/[eventId]/page.tsx | 관리자 운영 화면 | server |
| /admin/progress/event/new | src/app/(admin)/admin/progress/event/new/page.tsx | 관리자 운영 화면 | client |
| /admin/recruits | src/app/(admin)/admin/recruits/page.tsx | 관리자 운영 화면 | server |
| /admin/reports | src/app/(admin)/admin/reports/page.tsx | 관리자 운영 화면 | server |
| /admin/seasons | src/app/(admin)/admin/seasons/page.tsx | 관리자 운영 화면 | server |
| /admin/suggestions | src/app/(admin)/admin/suggestions/page.tsx | 관리자 운영 화면 | server |
| /admin/users | src/app/(admin)/admin/users/page.tsx | 관리자 운영 화면 | client |
| /ai-balance | src/app/(user)/ai-balance/page.tsx | 팀 밸런스/밴픽 추천/랜덤팀 편성 | server |
| /ai-balance/players | src/app/(user)/ai-balance/players/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /app | src/app/app/page.tsx | 서비스 홈/모바일 홈 | server |
| /app/account | src/app/app/account/page.tsx | 로그인, 계정, 인증 상태 처리 | server |
| /app/admin | src/app/app/admin/page.tsx | 관리자 운영 화면 | server |
| /app/admin/discord | src/app/app/admin/discord/page.tsx | 디스코드 봇/음성방/출석/운영 상태 연동 처리 | server |
| /app/admin/matches | src/app/app/admin/matches/page.tsx | 관리자 운영 화면 | server |
| /app/admin/recruits | src/app/app/admin/recruits/page.tsx | 관리자 운영 화면 | server |
| /app/admin/users | src/app/app/admin/users/page.tsx | 관리자 운영 화면 | server |
| /app/install | src/app/app/install/page.tsx | 화면 표시 | server |
| /app/matches | src/app/app/matches/page.tsx | 내전 경기 목록, 상세, 등록, 통계 연결 | server |
| /app/matches/[matchId] | src/app/app/matches/[matchId]/page.tsx | 내전 경기 목록, 상세, 등록, 통계 연결 | server |
| /app/me | src/app/app/me/page.tsx | 화면 표시 | server |
| /app/players | src/app/app/players/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /app/players/[playerId] | src/app/app/players/[playerId]/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /app/rankings | src/app/app/rankings/page.tsx | 랭킹/통계 계산 및 표시 | server |
| /app/recruits | src/app/app/recruits/page.tsx | 구인구직 생성, 현황, 참가자 관리 | server |
| /balance | src/app/(user)/balance/page.tsx | 팀 밸런스/밴픽 추천/랜덤팀 편성 | server |
| /community | src/app/(user)/community/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /community/[slug] | src/app/(user)/community/[slug]/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /community/[slug]/new | src/app/(user)/community/[slug]/new/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /community/clips | src/app/(user)/community/clips/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /community/posts/[postId] | src/app/(user)/community/posts/[postId]/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /community/posts/[postId]/edit | src/app/(user)/community/posts/[postId]/edit/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /destruction-auction-live/[tournamentId] | src/app/destruction-auction-live/[tournamentId]/page.tsx | 멸망전/경매/이벤트 진행 화면 및 관리 | server |
| /event-notices | src/app/(user)/event-notices/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /event-notices/[eventNoticeId] | src/app/(user)/event-notices/[eventNoticeId]/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /forgot-password | src/app/(user)/forgot-password/page.tsx | 화면 표시 | server |
| /highlights | src/app/(user)/highlights/page.tsx | 화면 표시 | server |
| /highlights/[highlightId] | src/app/(user)/highlights/[highlightId]/page.tsx | 화면 표시 | server |
| /images | src/app/(user)/images/page.tsx | 화면 표시 | server |
| /images/[imageId] | src/app/(user)/images/[imageId]/page.tsx | 화면 표시 | server |
| /install | src/app/install/page.tsx | 화면 표시 | server |
| /kakao | src/app/(user)/kakao/page.tsx | 카카오톡 봇 명령/양식/구인구직 연동 처리 | client |
| /login | src/app/(user)/login/page.tsx | 로그인, 계정, 인증 상태 처리 | server |
| /matches | src/app/(user)/matches/page.tsx | 내전 경기 목록, 상세, 등록, 통계 연결 | server |
| /matches/[matchId] | src/app/(user)/matches/[matchId]/page.tsx | 내전 경기 목록, 상세, 등록, 통계 연결 | server |
| /me/player | src/app/(user)/me/player/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | client |
| /notices | src/app/(user)/notices/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /notices/[noticeId] | src/app/(user)/notices/[noticeId]/page.tsx | 공지/커뮤니티/게시글 표시 및 관리 | server |
| /participation | src/app/(user)/participation/page.tsx | 화면 표시 | client |
| /participation/destruction/[tournamentId] | src/app/(user)/participation/destruction/[tournamentId]/page.tsx | 멸망전/경매/이벤트 진행 화면 및 관리 | server |
| /participation/event/[eventId] | src/app/(user)/participation/event/[eventId]/page.tsx | 화면 표시 | server |
| /participation/season | src/app/(user)/participation/season/page.tsx | 시즌 생성, 활성화, 시즌 기준 데이터 관리 | client |
| /players | src/app/(user)/players/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /players/[playerId] | src/app/(user)/players/[playerId]/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /players/balance | src/app/(user)/players/balance/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /players/balance/drafts | src/app/(user)/players/balance/drafts/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /players/balance/drafts/[draftId] | src/app/(user)/players/balance/drafts/[draftId]/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /players/balance/drafts/[draftId]/recommendations | src/app/(user)/players/balance/drafts/[draftId]/recommendations/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /players/balance/recommendations | src/app/(user)/players/balance/recommendations/page.tsx | 플레이어 검색, 상세, 계정/전적 관리 | server |
| /progress | src/app/(user)/progress/page.tsx | 화면 표시 | server |
| /progress/destruction | src/app/(user)/progress/destruction/page.tsx | 멸망전/경매/이벤트 진행 화면 및 관리 | server |
| /progress/destruction/[tournamentId] | src/app/(user)/progress/destruction/[tournamentId]/page.tsx | 멸망전/경매/이벤트 진행 화면 및 관리 | server |
| /progress/destruction/[tournamentId]/images | src/app/(user)/progress/destruction/[tournamentId]/images/page.tsx | 멸망전/경매/이벤트 진행 화면 및 관리 | server |
| /progress/destruction/[tournamentId]/images/[imageIndex] | src/app/(user)/progress/destruction/[tournamentId]/images/[imageIndex]/page.tsx | 멸망전/경매/이벤트 진행 화면 및 관리 | server |
| /progress/event | src/app/(user)/progress/event/page.tsx | 화면 표시 | server |
| /progress/event/[eventId] | src/app/(user)/progress/event/[eventId]/page.tsx | 화면 표시 | server |
| /random-team | src/app/(user)/random-team/page.tsx | 화면 표시 | client |
| /rankings | src/app/(user)/rankings/page.tsx | 랭킹/통계 계산 및 표시 | server |
| /recruit | src/app/(user)/recruit/page.tsx | 구인구직 생성, 현황, 참가자 관리 | server |
| /recruit-helper | src/app/(user)/recruit-helper/page.tsx | 구인구직 생성, 현황, 참가자 관리 | server |
| /signup | src/app/(user)/signup/page.tsx | 화면 표시 | server |

## 8. Prisma 모델 목록

| Model | 목적 | 필드 수 | 관계 수 | createdAt | updatedAt |
| --- | --- | --- | --- | --- | --- |
| AdminLog | 기타 도메인 데이터 | 13 | 0 | Y | N |
| AppDataCache | 기타 도메인 데이터 | 5 | 0 | Y | Y |
| BalanceMatchReview | 내전 경기/세트/참가 기록 | 31 | 2 | Y | Y |
| Champion | 기타 도메인 데이터 | 6 | 0 | Y | N |
| CommunityComment | 공지/커뮤니티 데이터 | 12 | 2 | Y | Y |
| CommunityHeadline | 공지/커뮤니티 데이터 | 7 | 0 | Y | Y |
| CommunityLike | 공지/커뮤니티 데이터 | 6 | 2 | Y | N |
| CommunityPost | 공지/커뮤니티 데이터 | 22 | 2 | Y | Y |
| CommunityReport | 공지/커뮤니티 데이터 | 13 | 3 | Y | N |
| CommunityVisit | 공지/커뮤니티 데이터 | 5 | 1 | N | N |
| DestructionMatch | 내전 경기/세트/참가 기록 | 18 | 3 | Y | Y |
| DestructionParticipant | 내전 경기/세트/참가 기록 | 14 | 3 | N | N |
| DestructionParticipationApply | 멸망전/경매/토너먼트 데이터 | 11 | 2 | Y | Y |
| DestructionTeam | 멸망전/경매/토너먼트 데이터 | 14 | 4 | N | N |
| DestructionTournament | 멸망전/경매/토너먼트 데이터 | 20 | 1 | Y | Y |
| DiscordAccountLinkLog | 디스코드 계정/음성/운영 연동 데이터 | 17 | 1 | Y | N |
| DiscordAdminActionLog | 디스코드 계정/음성/운영 연동 데이터 | 9 | 0 | Y | N |
| DiscordAttendanceSnapshot | 디스코드 계정/음성/운영 연동 데이터 | 11 | 0 | Y | N |
| DiscordBotHeartbeat | 디스코드 계정/음성/운영 연동 데이터 | 20 | 0 | Y | Y |
| DiscordMatchAttendanceCheck | 디스코드 계정/음성/운영 연동 데이터 | 12 | 0 | Y | Y |
| DiscordNicknameHistory | 디스코드 계정/음성/운영 연동 데이터 | 7 | 0 | Y | N |
| DiscordNotificationLog | 디스코드 계정/음성/운영 연동 데이터 | 9 | 0 | Y | N |
| DiscordOperationLog | 디스코드 계정/음성/운영 연동 데이터 | 14 | 0 | Y | N |
| DiscordOperationSetting | 디스코드 계정/음성/운영 연동 데이터 | 7 | 0 | Y | Y |
| DiscordRecruitVerification | 디스코드 계정/음성/운영 연동 데이터 | 13 | 0 | Y | Y |
| DiscordRoleSyncLog | 디스코드 계정/음성/운영 연동 데이터 | 10 | 0 | Y | N |
| DiscordVoiceEvent | 디스코드 계정/음성/운영 연동 데이터 | 20 | 1 | N | N |
| EventMatch | 내전 경기/세트/참가 기록 | 18 | 1 | Y | Y |
| EventNotice | 공지/커뮤니티 데이터 | 10 | 0 | Y | Y |
| EventParticipant | 내전 경기/세트/참가 기록 | 9 | 3 | N | N |
| EventParticipationApply | 기타 도메인 데이터 | 10 | 2 | Y | Y |
| EventTeam | 기타 도메인 데이터 | 9 | 3 | N | N |
| EventTournamentMatch | 내전 경기/세트/참가 기록 | 14 | 3 | Y | Y |
| GalleryImage | 기타 도메인 데이터 | 9 | 0 | Y | Y |
| Highlight | 기타 도메인 데이터 | 10 | 0 | Y | Y |
| KakaoFriendApplication | 카카오톡/구인구직/참가 신청 데이터 | 13 | 0 | Y | Y |
| KakaoLeaveRequest | 카카오톡/구인구직/참가 신청 데이터 | 12 | 0 | Y | Y |
| KakaoMeetupRecord | 카카오톡/구인구직/참가 신청 데이터 | 12 | 0 | Y | Y |
| KakaoSuggestionRequest | 카카오톡/구인구직/참가 신청 데이터 | 11 | 0 | Y | Y |
| MatchGame | 내전 경기/세트/참가 기록 | 10 | 1 | N | N |
| MatchMvpVote | 내전 경기/세트/참가 기록 | 8 | 3 | Y | N |
| MatchParticipant | 내전 경기/세트/참가 기록 | 12 | 3 | N | N |
| MatchSeries | 내전 경기/세트/참가 기록 | 10 | 1 | Y | N |
| Notice | 공지/커뮤니티 데이터 | 6 | 0 | Y | Y |
| OperationAiRequest | 기타 도메인 데이터 | 11 | 0 | Y | Y |
| Player | 유저/플레이어/계정 데이터 | 32 | 1 | Y | N |
| PlayerBalanceMatchResult | 유저/플레이어/계정 데이터 | 18 | 2 | Y | N |
| PlayerBalanceProfile | 유저/플레이어/계정 데이터 | 14 | 1 | Y | Y |
| PlayerChampionStat | 유저/플레이어/계정 데이터 | 10 | 3 | N | N |
| PlayerPositionStat | 유저/플레이어/계정 데이터 | 8 | 2 | N | N |
| PlayerRiotAccount | 유저/플레이어/계정 데이터 | 13 | 1 | Y | Y |
| PlayerSeasonStat | 유저/플레이어/계정 데이터 | 10 | 2 | N | N |
| PlayerSoloMatch | 유저/플레이어/계정 데이터 | 31 | 1 | Y | Y |
| PlayerSoloRankSnapshot | 유저/플레이어/계정 데이터 | 12 | 1 | Y | Y |
| RateLimitLog | 기타 도메인 데이터 | 4 | 0 | Y | N |
| RecruitParty | 카카오톡/구인구직/참가 신청 데이터 | 22 | 0 | Y | Y |
| RecruitPartyDiscordMonitor | 디스코드 계정/음성/운영 연동 데이터 | 14 | 1 | Y | Y |
| RecruitPartyLog | 카카오톡/구인구직/참가 신청 데이터 | 13 | 0 | Y | N |
| RecruitPartyMember | 카카오톡/구인구직/참가 신청 데이터 | 8 | 1 | Y | N |
| RiotApiStatus | 통계/랭킹 계산 데이터 | 11 | 0 | N | Y |
| Season | 시즌 기준 데이터 | 12 | 0 | Y | N |
| SeasonParticipationApply | 시즌 기준 데이터 | 17 | 2 | Y | Y |
| SeasonParticipationPendingApply | 시즌 기준 데이터 | 20 | 1 | Y | Y |
| SeasonResult | 시즌 기준 데이터 | 7 | 2 | N | N |
| TeamBalanceDraft | 기타 도메인 데이터 | 16 | 1 | Y | Y |
| TeamBalanceDraftPlayer | 유저/플레이어/계정 데이터 | 14 | 2 | Y | N |
| UserAccount | 유저/플레이어/계정 데이터 | 28 | 0 | Y | Y |
| UserDisciplineRecord | 유저/플레이어/계정 데이터 | 28 | 2 | Y | Y |

## 9. 다음 수동 검수 순서

1. 카카오톡: `봇버전`, `내전구인`, `내전현황`, `/2인파티`, `구인현황`, `13ㅉ`, 운영 양식 4종을 순서대로 테스트합니다.
2. 디스코드: 음성방 입장/퇴장 → `/admin/discord` 반영 → 구인 검증 → 자동마감 후보/완료 로그를 확인합니다.
3. 관리자: 내전 등록 → 내전 목록 → 플레이어 상세 최근 경기 → 랭킹 반영까지 한 흐름으로 확인합니다.
4. 모바일: `/app` 내부에서 PC 화면으로 이탈하지 않는지 확인합니다.
5. API 검토 플래그는 실제 코드 의도와 비교해 오탐 여부를 분류한 뒤 수정/무시를 결정합니다.
