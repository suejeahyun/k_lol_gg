# 카카오 파티 DRAFT 활성화 QA

## 범위와 판정

- 확인됨: 파티 모델에 nullable `organizerText`가 추가되고 `recruiting.parties.organizer_text` forward migration이 생성됐다.
- 확인됨: 초기 생성은 DRAFT 번호만 예약하며 시작시간·게임정보·주최자 세 줄과 기존 V1 말미 안내를 반환한다.
- 확인됨: 주최자만 채운 metadata-only 양식은 빈 시작시간을 현재 KST, 빈 게임정보를 `미입력`으로 기본화해 활성화하고, 세 줄 모두 빈 무편집 양식은 거절한다.
- 확인됨: V1 strict 설치본은 `/봇버전`에 `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R10_2026_09_13_PARTY_DRAFT_ORGANIZER`를 반환한다.
- 확인됨: 주최자를 명단과 분리해 저장·표시하며 참가자로 자동 등록하지 않는다.
- 확인됨: 기존 참가행 전체 양식과 선행 `/` 입력은 계속 수용한다.
- 확인됨: DRAFT는 현황·상세·빠른 추가·삭제 대상에서 숨기고 IN_PROGRESS만 빠른 명단 변경 대상으로 삼는다.
- 미반영: 운영 서버 배포, 휴대폰 재설치, 실제 카카오 방 E2E.

## 검증 결과

- focused TypeScript: 132 pass, 1 PostgreSQL 전용 skip, 0 fail
- V1 strict·V4 모바일·호환 계약: 63 pass, 0 fail
- 격리 PostgreSQL recruiting scope: 47 pass, 0 fail
- migration journal: 1 pass, 0 fail
- `npm run typecheck`, focused ESLint, `npm run db:erd:check`, `git diff --check`: 통과
- V4·V1 strict 생성: 통과. V1 strict R10은 LF 62,841자, CRLF 64,679자

## 복구

애플리케이션은 `organizer_text = NULL`인 기존 행을 `미입력`으로 읽으므로 컬럼 추가 직후 데이터 backfill은 없다. 코드 롤백 시 새 nullable 컬럼은 그대로 두어도 이전 코드에 영향을 주지 않는다. 컬럼 제거는 별도 승인과 백업 후에만 수행한다.

## 남은 위험과 다음 패치 추천

1. 운영과 동일한 휴대폰 생성본에서 `2인파티 → 메타데이터 전체 전송 → 상세 6 추가/삭제` 실방 E2E를 수행한다.
2. DRAFT가 장시간 제출되지 않은 경우 자동 정리 건수와 번호 고갈 지표를 운영 대시보드에 추가한다.
3. 주최자 입력 길이 초과·제어문자·동일 이벤트 재전송 사례를 관측 가능한 오류 코드로 집계한다.
4. 같은 2단계 예약·활성화 helper를 내전·스크림 후속 설계에 재사용한다.
