# 요구사항 판정표

판정 기준:

- `검증 완료`: 현재 기능 커밋에서 자동·DB·브라우저 증거가 있다.
- `기존 운영 확인`: 이전 운영 릴리스 근거가 있고 이번 회귀도 통과했다.
- `외부 검증 필요`: 소스는 준비됐지만 실기기·실계정·운영 배포 증거가 없다.
- `안전상 보류`: 자동으로 실행하면 운영 데이터 손실 가능성이 있다.

| 영역 | 요구사항 | 판정 | 근거·남은 조건 |
| --- | --- | --- | --- |
| 팀 밸런스 | V1 평가 기준 유지, 하나의 AI 최적안 | 검증 완료 | 단일 추천 UI·도메인 후보 1건 계약, desktop/mobile 캡처 |
| 팀 밸런스 | 이름 옆 라인 버튼, 첫 선택 주·이후 부, 긴 이름 정렬 | 기존 운영 확인 | V1 팀 밸런스 릴리스와 전체 캡처 회귀 |
| 팀 밸런스 | 수동 dropdown·교체 시작·끌기 안내 제거 | 검증 완료 | 수동 카드 정보·드래그·키보드 교체만 유지 |
| 팀 밸런스 | 팀 밸런스 초안 저장·관리자 경기 등록 가져오기 | 검증 완료 | owner/admin DB 계약과 경기 provenance 계약 |
| 팀 결과 | 화면 공유용 결과, 복사와 결과 접수 | 검증 완료 | 결과 복사·경기 결과 접수 CTA와 반응형 캡처 |
| 경기 | 상세·내전 기록·챔피언 사진·KDA·MVP | 검증 완료 | match public DB/HTTP/UI 및 공식 portrait projection |
| 경기 등록 | 초안 import 뒤 이름 자동 채움, 챔피언·KDA 입력 | 검증 완료 | team draft provenance와 관리자 import 계약 |
| 경기 등록 | OCR 기본 접힘, 진행 초 제거 | 검증 완료 | UI 15/15 및 desktop/mobile 캡처 |
| 플레이어 | 프로필·Riot 전적·내전 요약 | 검증 완료 | 공개 profile/runtime 계약; 데이터 부재는 명시 상태 |
| 플레이어 | 신청 포지션 유형·승률·평균 KDA·밸런스 점수 | 검증 완료 | 통계 projection PostgreSQL 계약 |
| 플레이어 | 본인·관리자 Riot ID와 티어 편집 | 기존 운영 확인 | 실제 PostgreSQL·Chromium·412·연결 안전 경계 |
| 랭킹 | 승률·최다 참여·최다 MVP, MMR 화면 | 검증 완료 | `/rankings`, `/rankings/mmr` route/UI/DB 계약 |
| 이미지 | 사이트 챔피언 이미지 전체 | 검증 완료 | Data Dragon 16.17.1, 173종·346개 HTTP/decode |
| 홈 | 여성 챔피언 테마 이미지 전체 | 검증 완료 | 68/68, 1672×940, duplicate 0 및 홈 육안 캡처 |
| 콘텐츠 | 기본 하이라이트, 챔피언·갤러리 UI 통일 | 검증 완료 | 공통 media shell 및 관리자 route 계약 |
| 갤러리 | 기존 이미지 복구·외부 이미지 관리 | 검증 완료 | public/admin media DB 계약과 fallback UI |
| 이벤트 | 이벤트전·멸망전·참가·팀·결과·MVP | 검증 완료 | S07/S08 PostgreSQL 계약과 공개·관리자 화면 |
| 레거시 | V1 숫자 상세 링크 보존 | 검증 완료 | DB 존재 확인·308 UUID redirect·query allowlist 26/26 |
| 관리자 | 징계 수정·삭제는 SUPER만 | 검증 완료 | page/API/DB 권한 테스트 |
| 관리자 | Kakao 설정·로그·상태·방은 SUPER만 | 검증 완료 | 직접 URL 포함 auth guard 및 숨김 UI |
| 관리자 | Kakao 통계 이름 검색·함께한 사람 | 검증 완료 | bounded 365일/1,000파티 통계 projection |
| 관리자 | 흰색 버튼·영문 상태·참가인원 집계 | 검증 완료 | 대비/focus/한글화 테스트와 전체 캡처 |
| 계정 | account/riot UI 통일 | 검증 완료 | 공통 AccountShell 계약과 캡처 |
| 계정 | 자동 승인·기존 대기 일괄 승인·SUPER 역할 변경 | 기존 운영 확인 | 이전 운영 릴리스·DB 감사 근거, 이번 auth 회귀 |
| Kakao | V1과 같은 명령·응답·양식 흐름 | 검증 완료 | V1 원본 동등성 95/95, strict 집중 14/14 |
| Kakao | 모든 명령 `/` 유무 허용 | 검증 완료 | canonical command 계약 |
| Kakao | 양식 생성 시 저장하지 않고 작성 완료 시 저장 | 검증 완료 | draft/full snapshot 계약 |
| Kakao | 공백·줄바꿈·추가입력·삭제·취소·ALL 허용 | 검증 완료 | input tolerance P0와 DB contract |
| Kakao | 다른 사용자 수정·종료, 관리자 전용 없음 | 검증 완료 | same-installation cross-sender DB 계약 |
| Kakao | 오전 6시 일일 종료, 변경 뒤 전체 현황 | 소스 검증 완료 | KST nonce/replay cron·mutation status 계약; Production cron 필요 |
| Kakao | 한 휴대폰·두 기능 방, 방/발신자 파싱 제거 | 검증 완료 | 설치본 identity/profile 계약; 잘못된 방 설치는 알려진 제한 |
| Kakao | MessengerBot R 전체 코드 한 번에 복사 | 소스 검증 완료 | public/private builder와 크기·Rhino 검사; 휴대폰 설치 필요 |
| Riot | 닉네임#태그 기반 전적·챔피언·티어 갱신 | 소스 검증 완료 | 합성 provider·PostgreSQL PASS; 실제 Riot 계정 필요 |
| Blob | 이미지 업로드·읽기·삭제 | 소스 검증 완료 | repository 계약 PASS; 실제 Vercel Blob 필요 |
| 운영 | 103개 페이지·335개 반응형 전체 캡처 | 검증 완료 | HTTP 200, issue 0, 자격증명 미저장, 종료 코드 0 |
| 운영 | Vercel 배포·alias smoke | 확인됨 | Production `dpl_48xow9mENhg2BrSAZyFdBD4giJQZ`, 운영 health·주요 공개 경로 HTTP 200 |
| 데이터 | test/test000 플레이어 삭제 | 안전상 보류 | 참조·복구 근거 확인 전 삭제 금지 |
