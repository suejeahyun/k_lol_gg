# 내전 복사 양식 1.0.0

`kakao-inhouse-copy@1.0.0` / tag `kakao-inhouse-copy-v1.0.0` / **NOT_DEPLOYED**

내전 양식을 보기 쉽게 정리하고 이름·라인·시작 시간 편집과 현재 모집 목록 응답을 연결했다. 협곡은 라인을 필수로 받으며, 이름 미일치·동명이인·회원 연결 확인을 접수 결과에서 안내한다. 사이트와 카카오의 통합 정원을 보호하고 모집 마감 시 참가 명단을 보존한다.

카카오 저장으로 10명이 차면 즉시 디스코드 대기 안내를 출력한다. 사이트 충원에 대한 카카오방 자동 푸시는 기존 R24 전달 방식의 한계로 별도 구현이 필요하다.

전체 check·프로덕션 빌드 PASS. 격리 DB 86 PASS, 계약 410 PASS, 단위 873 PASS·DB 전용 1 skip. migration 0041의 새 설치·업그레이드·재실행 검증. 운영 배포와 실기기 교체는 수행하지 않았다.

[QA·제약·다음 추천](../qa-evidence/kakao-inhouse-copy-v1.0.0-2026-09-21/README.md) · [디스코드 공지](../qa-evidence/kakao-inhouse-copy-v1.0.0-2026-09-21/DISCORD_NOTICE.md)
