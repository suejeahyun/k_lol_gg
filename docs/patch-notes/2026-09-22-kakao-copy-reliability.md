# 카카오 복사 양식 안정화 1.0.0

`kakao-copy-reliability@1.0.0` / tag `kakao-copy-reliability-v1.0.0` / **NOT_DEPLOYED**. 소스 commit은 [릴리스 등록부](../releases/registry.json)에 연결한다.

양식코드가 있는 N인파티의 이름 삭제·교체와 시작·게임 편집을 발급 원본과 최신 상태를 비교해 반영한다. 동시 참가를 보존하고, 같은 항목의 상충·빠진 행·정원 및 종목 변경·코드 양식의 자동배정 전환은 저장하지 않는다. 마감된 파티와 처리 중 상태가 바뀐 마감에 구체적인 안내를 제공하며 예비 번호 정렬과 입력 자모 표시를 보완했다.

구형 협곡 양식의 기존 이름 전용 행은 발급 원본과 일치할 때만 원본 라인을 보완한다. 신규·교체 이름의 라인 필수 계약, 취소자 재등장 방지, 최신 라인 보존과 SITE·운영진 확정 항목 보호를 유지한다. 내전 무변경 응답과 번호 없는 상세 안내를 명확하게 했다.

R25 공개/private 설치 산출물을 생성하고 로컬 도움말을 갱신했다. 실제 휴대폰에는 설치하지 않았다. ADR 0011의 전체 UX가 아닌 관련 편집·오류 안내 범위의 부분 반영이다. 새 migration은 없으며 이전 미배포 내전 패치의 `0041_clever_skullbuster`에 의존한다.

최종 도움말과 R25 산출물 기준으로 전체 `npm run check`와 프로덕션 빌드 exit 0. 계약 410 PASS, 단위 902 PASS·격리 DB 전용 1 skip, 격리 DB 86 PASS. 공개 봇 VM 34/34와 공개/private SHA-256도 기록했다. 초기 TypeScript fixture 실패와 다른 방 무변경 응답의 DB 기대값 불일치는 별도 로그로 보존했다. 운영 배포·운영 DB 변경은 수행하지 않았다.

[QA·초기 실패·운영 전 위험·다음 추천](../qa-evidence/kakao-copy-reliability-v1.0.0-2026-09-22/README.md) · [디스코드 복붙 공지](../qa-evidence/kakao-copy-reliability-v1.0.0-2026-09-22/DISCORD_NOTICE.md)
