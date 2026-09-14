# 카카오 R16 내전·파티 동일 흐름 QA

검토일: 2026-09-14 KST

대상: 내전 양식 생성·분류·저장·상세 응답, MessengerBot R V1 strict 공개/비공개 설치본

판정: 소스 수정, 전체 앱 검사, 격리 PostgreSQL 계약, Rhino 정적 검사를 통과했다. Vercel 운영 배포와 라이브 API 검증은 배포 단계에서 기록하며, 휴대폰 실기기 설치와 실제 카카오톡 응답은 사용자 설치 후 확인 대상이다.

## 확정 동작

1. `내전구인 종목`은 시작시간·게임정보·주최자만 작성하는 양식을 반환하며 이 시점에는 공개 현황에 노출하지 않는다.
2. 주최자를 채운 전체 양식을 전송하면 내전이 활성화되고 주최자가 1번 참가자가 된다.
3. 같은 방의 일반 사용자는 `내전상세 N 추가/삭제 이름`과 `내전 Nㅉ`을 사용할 수 있다.
4. 활성화 응답은 변경 요약 뒤에 게임정보·주최자·현재 명단·빠른 명령을 포함한 최신 상세를 표시한다.
5. 기존 협곡 티어·라인 전체 양식과 칼바람·증바람 이름 전체 양식도 계속 처리한다.
6. 주최자 삭제 후 메타데이터 수정은 삭제한 주최자를 명단에 다시 넣지 않는다.

## 생성물

| 파일 | LF 문자 | CRLF 문자 | 물리 줄 | SHA-256 | Rhino 경고 후보 | 혼합 return |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,704 | 65,520 | 1,817 | `04b345e270153169a127364610c97632ddefb4241476dea00b085da58949acbe` | 0 | 0 |
| private 전체 복붙 파일 | 61,918 | 63,731 | 1,814 | `0075b557a72e0b087da4b8c967e724b7235e6fef1712373e693935f5cd483463` | 0 | 0 |

두 파일 모두 MessengerBot R CRLF 65,535자 제한 이내다. private 설정값은 보존했으며 문서나 Git에 추가하지 않는다.

## 검증 결과

```text
node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v4-v1-compatibility-contract.test.mjs
PASS — 39/39

npm run check
PASS — lint 오류 0, 타입 검사, 일반 테스트 778 PASS·DB 전용 1 skip,
       ERD 102 tables/165 FK, 홈 여성 챔피언 가이드 68장, 프로덕션 빌드 93 pages

npm run test:db
PASS — PostgreSQL 18 격리 클러스터, migration 40개,
       내전 생성·수정·추가·삭제·마감·다중 사용자·방 격리 계약 포함 전체 통과

node scripts/audit-messengerbot-rhino-static.mjs <public> <private>
PASS — ES5, warning candidate 0, mixed return 0, 주석 0, 버전 선언 1, response 함수 1
```

## 운영 반영 상태와 남은 확인

- 기능 커밋: 배포 전
- 릴리스 tag: `kakao-r16-inhouse-party-flow-v1.0.0`
- Vercel 운영 배포: 배포 전
- 운영 별칭: `https://k-lol-gg.vercel.app`
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 실제 휴대폰 컴파일, `/봇버전`, 내전 활성화→추가→삭제→마감 확인은 사용자 실기기 설치 후 남는다.

## 다음 패치 추천

1. 휴대폰 실기기 전사를 익명화해 자동 회귀 fixture로 추가한다.
2. 전체폭 숫자·오타·복사 머리말이 섞인 내전 상세 명령 허용 범위를 계약으로 고정한다.
3. 공개 검토본의 CRLF 크기 여유가 작으므로 중복 진단 문자열을 공통화한다.
4. 운영 중 DRAFT가 오래 남으면 공개 노출 없이 만료시키는 유지보수 지표를 추가한다.
