# Kakao V4 Phase 3-B operations QA

작업일: 2026-09-10 KST

## 범위와 판정

- 브랜치: `feat/kakao-v4-phase3-operations-20260910`
- 기준 커밋: `288d5a50c5236239613783ac2c9e9a667fdf9264`
- V1 운영 양식 4종(친구 등록, 건의·신고, 정모, 외출)을 V4 classifier → canonical command → dispatcher → 기존 operation forms application service에 연결했다.
- 등록 센터, 내전 결과 등록·현황, 경고 등록·인증·현황, `사진취소`는 V1의 제목·링크·줄바꿈을 그대로 반환한다.
- 예약 공지는 기존 assistant query를 한 번만 실행하고 V41 형식의 읽기 전용 안내를 반환한다.
- 양식 제출은 allowlist 기반 typed payload로 변환하며, 필수값 누락 시 누락 필드가 포함된 `INVALID_FORM` 응답을 반환한다.
- 모든 공개 운영 명령은 공통 V4 event scope를 사용한다. 같은 `eventId`와 같은 서명 본문은 저장 응답을 replay하고, 다른 본문은 `409 REPLAY_CONFLICT`로 차단한다.
- 정적 링크·필드 누락 안내도 기존 assistant receipt transaction에서 nonce claim, receipt claim, 응답 저장을 함께 수행한다.
- 양식 제출은 기존 operation forms transaction에서 nonce/receipt, form row, audit, outbox, receipt 완료를 함께 처리한다.
- Kakao sender 역할이나 작성자 소유권 조건은 추가하지 않았다. 설치 profile과 canonical room의 기존 검증 경계만 사용한다.

## 명령 범위

- 양식: `친구등록양식`, `건의신고양식`, `정모양식`, `외출양식` 및 V1 호환 wrapper
- 등록·결과: `등록`, `등록센터`, `내전등록`, `결과등록`, `결과현황`
- 경고·증거: `경고등록`, `경고인증`, `인증`, `경고현황`
- 사진: V1 별칭 `사진취소`의 등록 센터 안내
- 예약 공지: V1 예약 시간 12·15·18·20시

내부 전용 raw JSON, `V2사진취소`, 휴대폰 로컬 사진 세션 명령은 공개 canonical command로 열지 않았다.

## DB와 운영 상태

- DB migration은 필요하지 않으며 생성하거나 적용하지 않았다. 기존 receipt, nonce, operation form, audit, outbox schema를 재사용한다.
- 운영 DB, 환경변수, Vercel, 운영 서버/JAR, 실제 카카오방에는 반영하지 않았다.
- 판정: **개발 소스만 반영**. 운영 반영 여부는 미반영이다.

## 남은 위험

- 친구 등록 양식에 표시 이름이 없는 V4 envelope은 개인정보가 아닌 opaque sender ID를 신청자 fallback으로 저장한다. 관리자 화면의 표시 품질은 staging에서 확인이 필요하다.
- 실제 PostgreSQL을 연결한 서명 HTTP E2E는 수행하지 않았다. transaction과 receipt identity는 unit/contract 수준에서 검증했다.
- V4 텍스트 envelope에는 이미지 바이너리가 없으므로 실제 사진 업로드·로컬 세션 명령은 이번 공개 서버 경로에 포함하지 않았다.

## 다음 패치 추천

1. 실제 PostgreSQL staging에서 서명된 HTTP 요청으로 동일 event replay와 다른 본문 409를 검증한다.
2. 실제 카카오 클라이언트에서 운영 양식 4종과 정적 링크의 줄바꿈·클릭 동작을 golden E2E로 고정한다.
3. V4 action/profile/replay/conflict를 개인정보 없이 집계하는 운영 관측 지표를 추가한다.
4. 서버 기반 이미지 업로드가 필요할 경우 V4 envelope과 세션 계약을 별도 설계하고 `V2사진취소`를 이관한다.
5. 친구 등록 신청자 fallback을 위한 안전한 표시명 필드 제공 가능성을 클라이언트 계약에서 검토한다.
