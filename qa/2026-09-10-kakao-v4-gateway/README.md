# Kakao V4 gateway QA

작업일: 2026-09-10 KST

## 범위

- 단일 V4 command gateway와 application service 뼈대
- RECRUIT/FEATURES installation profile authorization
- room/channel/name 비수집 schema
- boot ID + monotonic counter event fallback
- ES5 source와 휴대폰용 단일 파일 생성기
- V1 fixture 기반 계약 및 집중 자동 테스트

## 판정 기준

- `V4상태`, `V4계약확인`: 서버 응답 가능.
- `봇버전`, `도움말`: 네트워크 요청 없는 로컬 응답.
- 그 외 V1 명령: dispatcher 연결 전까지 명시적 501.
- 이미지: 이번 범위 제외.
- 운영 DB·환경변수·배포·실제 봇 설치: 변경 금지.

명령별 실행 결과는 `COMMAND_RESULTS.md`에 기록한다.
