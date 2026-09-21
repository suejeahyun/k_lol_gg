# 카카오 R24 1.0.1 — 파티 양식 문구 정리

파티 양식에서 중간 복사 안내와 양식코드 뒤 괄호 설명을 제거하고 참가/예비 명단 사이에 빈 줄을 넣는다. 사용자가 제시한 간단한 복사 양식에 맞춘 서버 응답 변경이다.

기존 휴대폰 봇 산출물은 유지한다. 생성·상세·참가 저장 후 최신 양식 모두 같은 renderer를 사용하며 사이트 연동과 저장 정책은 유지한다.

2026-09-21 운영 서버 반영: commit `33d7bf042ffda9f051588787d0cffb1a1ff7f71a`, tag `kakao-r24-site-linked-copy-v1.0.1`, Vercel `dpl_8jtg4dY911S3RAEjvtv9gv7nQa56` READY. 전체 검사·빌드와 운영 HTTP 검사 8건이 통과했다. 실제 휴대폰 설치 버전·채팅 송수신은 미확인이다. R24는 추가 코드 변경이 없으며 구형 R22에서 짧은 양식 저장까지 보장하는 패치는 아니다.

[검증·운영 상태·다음 추천 3개](../qa-evidence/kakao-r24-party-format-2026-09-21/README.md) · [디스코드 공지](../qa-evidence/kakao-r24-party-format-2026-09-21/DISCORD_NOTICE.md)
