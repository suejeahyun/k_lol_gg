# V2 팀 도구·Kakao 신청 통합 패치 근거

상태: 소스 반영 및 로컬 비파괴 검증 완료. 운영 배포, 운영 DB 변경, 실제 Kakao 메시지 전송은 수행하지 않았다.

## 반영 범위

- 팀 도구 대표 진입점을 `/tools/team-balance`로 통일하고 랜덤 팀·코인 토스·팀 밸런스·내 초안에 공용 메뉴를 적용했다.
- 승인 계정이 활성 플레이어를 회원명·닉네임·Riot ID로 서버 검색하고, 최근 시즌 신청을 SITE/KAKAO·날짜·회차별로 가져오도록 했다.
- 참가자 중복을 추가 단계에서 차단하고, 10명 선택과 포지션 확인을 모바일 친화적인 2단계 화면으로 나눴다.
- Kakao 보류 신청에 ADMIN 목록·필터·상세와 SUPER_ADMIN+TOTP 해결·취소 화면/API를 추가했다.
- 모집 회차 1~999를 공개 신청에 연결하되 실제 일반 신청 또는 ACTIVE pending이 있는 회차만 노출한다.
- SITE 신청과 관리자 검토 완료 상태가 Kakao 동기화에 덮어써지지 않는 병합 정책을 적용했다.
- pending 슬롯은 모든 생명주기 상태에서 같은 행을 재사용해 해결·취소 뒤 같은 슬롯 재수신 시 고유키 충돌이 나지 않게 했다.
- MessengerBot R V41 독립 실행 엔트리, raw-body HMAC 전송, 환경 계약, 실패 사유 관측과 V1 경로의 410 전환 응답을 추가했다.
- 모바일 하단 메뉴를 핵심 5개 진입점으로 정리하고 입력 포커스 중 하단 메뉴와 AI 버튼이 폼을 가리지 않게 했다.

## 검증 결과

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run test:contracts`: 115/115 PASS
- `npm run test:unit`: 449/449 PASS
- `npm run build`: PASS, App Router 빌드 목록에 신규 페이지/API 포함
- `npm run test:db`: PASS, 격리 PostgreSQL 18 클러스터 정상 종료 및 임시 경로 제거
- `npm run verify:auth-http`: PASS
- `npm run security:secrets`: PASS
- `npm run bot:kakao:v41` 및 생성 파일 `node --check`: PASS
- 로컬 브라우저: 공용 팀 메뉴와 대표 링크 확인, `/admin/seasons/kakao-pending`의 로그인 복귀 경로 확인

## 운영 반영 상태와 남은 위험

- 운영 Vercel과 운영 DB에는 미반영이다.
- 운영 Kakao 환경변수, 허용 방·발신자 ID, V41 봇 설치는 미수행이다.
- 실제 Kakao 앱의 서명·이미지 API 호환성은 스테이징/운영 봇 사본에서 확인해야 한다.
- 팀 초안 ID를 경기 결과 접수에 자동 연결하는 UI는 이번 범위에 포함하지 않았다. 현재 제공한 확정 로스터 조회 계약과 기존 경기 provenance 계약을 사용해 별도 권한 설계 후 연결해야 한다.

## 다음 패치 추천

1. Preview 환경에 Kakao V2 키와 opaque allowlist를 넣고 정상·만료 timestamp·금지 room을 실제 봇 사본으로 확인한다.
2. V41에서 party create→sync→status→finish와 revision 저장을 JSON 직접 입력 없이 진행하는 운영자 UI를 추가한다.
3. 팀 초안 소유권과 경기 접수 소유권을 서버에서 함께 검증하는 draft→match 연결 화면을 추가한다.
4. 운영과 같은 데이터 복제본에서 승인 사용자·SUPER_ADMIN 화면의 전체 브라우저 캡처 및 키보드 QA를 실행한다.
