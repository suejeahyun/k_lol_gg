# 카카오 파티 주최자 자동 참가 v1.0.0

## 판정

- 기능 ID: `kakao-party-organizer-auto-member`
- 기능 버전: `1.0.0`
- DB migration·운영 데이터 직접 수정: 없음
- MessengerBot R 변경·재설치: 없음
- 현재 상태: 소스 수정·전체 검증·Vercel 운영 배포 완료

## 재현 원인

메타데이터 전용 파티 양식은 주최자를 `organizerText`에 저장했지만 참가 명단 `members`는 빈 배열로 유지하는 계약이었다. 그래서 `주최자 : test`로 활성화한 5인 파티가 `0/5`로 표시됐다.

## 변경 계약

1. DRAFT 파티를 메타데이터 전용 양식으로 처음 활성화한다.
2. 명시 참가행이 없고 유효한 주최자가 있으면 주최자를 primary slot 1에 원자적으로 저장한다.
3. 일반 파티의 position은 `null`, 라인 파티의 slot 1은 기존 규칙과 같은 `TOP`을 사용한다.
4. 활성화 replay와 동일 이름 빠른 추가는 중복을 만들지 않는다.
5. 활성화 이후 주최자 메타데이터 수정은 기존 roster를 보존한다.
6. 주최자 참가자 삭제는 허용하고 주최자 메타데이터는 유지한다. 이후 메타데이터 수정만으로 삭제된 참가자를 재삽입하지 않는다.
7. 기존 참가행 전체 양식의 authoritative snapshot 의미는 유지한다.

## 기대 실사용 흐름

```text
》시작시간 : test
》게임정보 : test
》주최자 : test

→ 파티 #N 활성화
→ 1/5
→ 참여: test
→ 상세의 1번: test
```

“양식 불러오는 중…”은 오픈채팅봇의 정상 중간 안내이므로 그대로 유지한다.

## 로컬 검증 증거

- `npm run check`: PASS
  - lint: 오류 0, 기존 생성 산출물 warning 32
  - 계약·unit: 775개 중 774 PASS, DB 전용 1개 의도적 skip
  - 여성 챔피언 안내 이미지: 68/68, SHA-256 중복 0
  - Next.js production build: 정적 페이지 93/93
- 파티 domain focused: 22/22 PASS
- V1 호환 계약·parser·dispatcher focused: 70/70 PASS
- `npm run test:db`: 격리 PostgreSQL 18 전체 계약 PASS
  - recruiting 계약: 6/6 PASS
  - Kakao assistant 계약: 8/8 PASS
  - migration 40개, head `0039_massive_arachne`
  - 종료 시 cluster와 임시 경로 제거 확인
- `git diff --check`, 변경 범위 ESLint, TypeScript: PASS

## 오전 6시 경계 테스트 보완

격리 DB 검사 중 한국시간 오전 6시 이전에 달력 날짜와 모집 운영일이 달라지는 테스트 fixture 결함을 확인했다. 테스트 입력과 조회를 모두 `recruitingOperatingDateKey`로 통일했다. 실제 오전 6시 운영일 경계 규칙은 변경하지 않았다.

## 운영 배포 증거

- 기능 commit: `bd4a2ea506120883ec1513827cc6abdbe165d92d`
- Git tag: `kakao-party-organizer-auto-member-v1.0.0`
- Vercel deployment: `dpl_HK7Yr8GJSRNjpTbxwZLkD6n6ermi`
- 불변 URL: `https://k-lol-2i26r45ey-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- Vercel 상태: Production · Ready · Latest
- 운영 health: `2026-09-13T20:43:05.663Z`에 `/api/health` HTTP 200, `status: ready`
- private MessengerBot V1 strict live 점검: RECRUIT HTTP 200·FEATURES HTTP 200, gateway `OK`
- 휴대폰 설치본 R12는 변경하지 않았으며 재설치가 필요 없다.

## 남은 위험

- 이미 `IN_PROGRESS`인 기존 파티는 소급해서 주최자를 참가자로 넣지 않는다. 새 DRAFT 활성화부터 적용한다.
- 주최자 이름과 다른 사람이 같은 표시 이름을 쓰면 이름 기반 빠른 명령만으로 구분할 수 없다.
- 실제 Kakao 방에서 새 파티 번호로 양식을 전송해 `주최자 자동 참가 → 1/정원` 표시를 확인하는 마지막 사용자 실기기 확인은 남아 있다.

## 롤백

스키마·운영 데이터 변경이 없으므로 문제가 있으면 Vercel을 직전 확인 배포로 되돌린다. 이미 생성된 파티 명단을 자동 삭제하거나 운영 DB를 직접 수정하지 않는다.

## 다음 권장 패치

1. `내전 현황 N`, `내전 상세 N`처럼 내부 공백과 `#` 주변 공백을 안전한 단일행 범위에서 지원한다.
2. 내전 빠른 추가 응답의 참가자명을 Riot 닉네임이 아닌 사이트 회원명으로 상세 화면과 통일한다.
3. `수정` 명령은 기존 V1의 전체 양식 재전송 안내와 충돌하지 않도록 조회 안내 별칭 또는 명시적 포지션 수정 문법 중 하나로 확정한다.
4. 동명이인 빠른 삭제를 위한 슬롯 번호 기반 문법의 필요성을 실제 사용 로그로 평가한다.
