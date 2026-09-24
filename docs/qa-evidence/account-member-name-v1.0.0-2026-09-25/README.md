# 본인 이름 변경 1.0.0

`/account`에서 본인 이름을 확인하고 **이름·Riot ID·티어 변경** 링크로 편집할 수 있다. 기존 `AccountPlayerForm`과 `PATCH /api/auth/me/player`를 확장하며 승인된 활성 플레이어의 본인 세션에서 대상을 결정한다. 이름 2~100자, NFKC·안전 문자 검증, 이름 검색용 정규화 값을 함께 저장한다. 이전 클라이언트가 이름을 생략하면 기존 값을 보존한다.

이름은 인증된 본인 DTO에만 추가한다. 공개 플레이어·경기 DTO는 변경하지 않는다. 이름 변경은 플레이어 ID와 계정 연결을 유지하며 감사 전후 값·revision·멱등성 영수증과 같은 transaction에서 반영된다. 이름만 수정하면 Riot 연결과 진행 중 동기화 작업을 유지한다. 스키마·migration 및 휴대폰 코드는 변경하지 않는다.

## 검증

- `npm run check` PASS: 계약 435, 단위 954, 별도 DB 의존 1 skip. lint 0 오류·기존 57 경고, 타입·ERD·가이드 이미지·프로덕션 빌드 PASS.
- `V2_DB_CONTRACT_SCOPE=accounts npm run test:db` PASS: 일회성 PostgreSQL 18의 계정 lifecycle 계약 1개(가입·복구·경쟁·rollback 포함), 실제 Next 계정/관리자 HTTP와 Chromium 검증. 테스트 종료 후 격리 클러스터 정리 완료.
- HTTP: 본인 이름 조회·저장, NFKC와 검색 정규화, 변경 감사, 다른 플레이어 변경 없음, 잘못된 이름/타인 ID 주입 거부, 비인증·다른 origin 거부, If-Match 필수, 멱등 재전송과 이름 변경 키 재사용 409, 기존 이름 생략 요청 호환.
- 이름만 수정한 연결 계정: player ID·userAccountId·Riot 연결·PUUID·작업 세 건 유지 확인. Riot ID 변경 시 기존 연결 해제와 rollback 보호도 검증.
- 실제 Chromium: 이름 입력 후 키보드 저장, 저장 후 폼·계정 개요 갱신, 다른 창과 충돌 시 412·최신 이름 복구, 1280px/360px에서 이름 레이블·입력 너비·가로 overflow 검사 PASS.
- 테스트 스크립트 추가 변경의 lint·typecheck, 비밀정보 검사와 `git diff --check` PASS.

운영 사용자 프로필을 검증 목적으로 수정하지 않았다. 실제 저장 검증은 합성 계정과 일회성 DB에서 수행했다.

## 배포

소스: `b1d5344c4fae15e60f91e4c638885b556dbbb9f9`. Vercel `dpl_4v74zLHHdbzh5nUZjjL8qc6GkStf` READY, 운영 alias와 소스 SHA 일치. 2026-09-25 06:07 KST 운영 health ready, 계정 페이지의 로그인 이동(Next 스트리밍 응답), 본인 API 비인증 401 확인. [배포·smoke](./deployment.json), [검증 결과](./validation.json).

GitHub main CI [36059193205](https://github.com/suejeahyun/k_lol_gg/actions/runs/36059193205) SUCCESS: 전체 검사·빌드와 관리자 HTTP 인증 매트릭스 PASS. 태그 `account-member-name-v1.0.0`은 위 검증된 소스 SHA를 가리킨다.
