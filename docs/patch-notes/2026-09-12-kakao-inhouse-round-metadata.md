# 카카오 내전 시간·공지 보존 v1.0.0

내전 참가 양식에서 수정한 시작 시간과 자유 공지가 참가자 명단과 함께 회차 메타데이터로 저장되고 `내전현황`·상세에 그대로 표시된다. 기존 메타데이터 없는 회차에만 협곡·21:00·10명 fallback을 적용한다.

완전한 빈 1..10 양식의 전체 취소, 이름만·부라인 공란·`ALL`·들여쓰기 입력을 허용한다. 번호형 공지와 정상 참가자 수정·취소를 구분하고, 종목 변경 때 SITE 신청을 보존하며 확정 참가자가 있는 회차는 변경을 거절한다.

운영 Neon에 `0037_swift_brood`를 적용했고 Vercel 운영 alias health를 확인했다. 휴대폰 R7 설치와 실제 Kakao 송수신은 사용자 확인이 필요하다.

검증과 복구 근거는 [`docs/qa-evidence/kakao-inhouse-round-metadata-2026-09-12/README.md`](../qa-evidence/kakao-inhouse-round-metadata-2026-09-12/README.md)에 기록했다.
