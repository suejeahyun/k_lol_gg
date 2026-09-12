# 카카오 구인 마감 대상 조회 핫픽스 v1.0.1

## 판정

- 기능 ID: `kakao-recruit-input-recovery`
- 기능 버전: `1.0.1`
- 코드 커밋: `8b476ad7181d002e41b71e0d297c028a1b213ec5`
- Git tag: `kakao-recruit-input-recovery-v1.0.1`
- Vercel 배포: `dpl_67gzXT1pRnY6ybCWPM78JEHgB46q`, `Ready`
- 불변 URL: `https://k-lol-7xg47f0f7-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 운영 health: `2026-09-12T03:52:15.274Z`에 HTTP 200, JSON `status: ready`
- DB migration: 없음, head `0036_flowery_hairball` 유지
- 휴대폰 코드: 변경 없음, 재설치 불필요
- 실제 Kakao 방에서의 마감 canary: 사용자 확인 대기

서버 핫픽스의 빌드·DB 계약·배포·운영 health는 확인했다. 실제 휴대폰에서 `구인현황` 직후 표시된 번호를 다른 사용자가 마감하는 최종 송수신은 아직 확인하지 않았으므로 실기기 E2E 완료로 판정하지 않는다.

## 확인된 원인

`15ㅉ`, `16ㅉ`, `17ㅉ` 자체는 V1 strict와 V4 서버 모두 정상 마감 명령으로 분류했다. 실패 시각의 Vercel 로그에서는 `/api/integrations/kakao/v4/commands`가 HTTP 400을 반환했다.

기존 PARTY 호환 대상 조회는 같은 방·운영일·번호만 제한하고 상태는 제한하지 않았다. 같은 번호의 더 높은 `resetSequence` 종료·초안 행이 있으면 현황에 보이는 낮은 reset의 `IN_PROGRESS` 행 대신 변경 불가능한 행을 선택할 수 있었다. 또한 현재 운영일에 대상이 없는 경우의 `NOT_FOUND`가 일반 입력 오류 400으로 번역돼 실제 원인을 숨겼다.

## 변경 내용

- `FINISH_PARTY`는 현재 운영일·같은 설치 범위·같은 번호의 `IN_PROGRESS`만 선택한다.
- `SYNC_PARTY`는 같은 범위의 `DRAFT | IN_PROGRESS`만 선택한다.
- 더 높은 reset의 `FINISHED` 또는 `DRAFT`가 있어도 진행 중 행만 마감한다.
- 현재 운영일에 진행 중 대상이 없으면 mutation 없이 HTTP 200 응답으로 원인 안내와 최신 전체 구인현황을 반환한다.
- 같은 설치 범위의 다른 일반 사용자가 만든 모집을 수정·마감할 수 있는 기존 정책을 유지한다.
- 다른 방이나 이전 운영일을 번호만으로 검색해 마감하는 fallback은 추가하지 않았다.
- 전각 `／１５ㅉ`과 `# 15ㅉ`, `구인마감 # 15`, `상세 # 15`를 허용한다.
- NFKC는 원문 서명과 raw body digest 검증 뒤 명령 분류에만 적용한다.

## 검증 증거

- focused 최종 검사: 63개 중 62 PASS, DB 전용 1개 intentional skip
- 독립 focused 재검수: 84개 중 83 PASS, DB 전용 1개 intentional skip
- 전체 `npm run test:db`: PASS
- DB 회귀에서 같은 번호의 더 높은 reset `FINISHED/DRAFT`를 보존하고 낮은 reset `IN_PROGRESS`만 다른 sender가 마감함을 확인
- 다른 room 시도는 mutation 0으로 확인
- 전체 `npm run check`: 계약·단위 717개 중 716 PASS, DB 전용 1개 intentional skip, production build 92 pages PASS
- 여성 홈 가이드 아트: 68/68, 중복 SHA-256 0
- TypeScript, ERD drift, 변경 범위 ESLint, `git diff --check`: PASS
- 추적 트리 비밀정보 검사: PASS
- 독립 보안 재검수: BLOCK 없음

## 남은 위험과 운영 확인

- 배포 전 현황을 보고 배포 후 마감하거나 오전 6시 운영일 경계를 넘긴 경우에는 이전 번호를 자동 마감하지 않는다. 최신 `구인현황`을 함께 보여준다.
- 서로 다른 설치 비밀값이나 중복 활성 스크립트가 status와 finish를 나눠 처리하면 같은 Kakao 화면이어도 서로 다른 설치 범위가 될 수 있다.
- 최종 canary는 실제 구인방에서 `구인현황`을 새로 호출한 뒤, 표시된 진행 중 번호를 생성자가 아닌 다른 사용자가 `번호ㅉ`으로 마감하고 후속 전체 현황까지 확인한다.

## 롤백

스키마와 운영 데이터 삭제가 없다. 문제가 확인되면 Vercel을 직전 확인 배포로 되돌린다. 방 범위 검사나 운영일 경계를 제거하지 않는다.

## 다음 권장 패치

1. V4 응답에 개인정보 없는 내부 실패 분류와 trace 상관관계를 남겨 400 원인을 운영 로그에서 바로 구분한다.
2. 사용자가 오래된 현황의 번호를 입력했을 때 최신 운영일이 바뀌었음을 더 명확하게 표시한다.
3. 사용하지 않는 legacy `/api/integrations/kakao/recruits` 소비자 존재 여부를 조사하고 stale 마감 응답 계약을 V4와 통일한다.
4. 실제 두 Kakao 방 canary 절차를 체크리스트와 익명 성능 지표로 자동 기록한다.
