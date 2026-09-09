# Kakao R7 slash parity QA

## 범위와 기준

- 기준: `origin/main` `e408bdd50260b9f48ebea5ee509d34aced295ca6`
- 격리 브랜치: `fix/kakao-slash-command-parity`
- 운영 배포/환경변수/휴대폰 설치: 수행하지 않음
- 생성 버전: `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R7_SLASH_PARITY`

## 확인된 결과

- 기계 판독 명령 계약 100개: CORE 20, PARTY 33, INHOUSE 13, SCRIM 21, MANAGED 13.
- 모든 계약 예시는 무슬래시, `/`, 전각 `／` 입력이 같은 canonical command가 되는 테스트를 통과했다.
- `/`, URL, 문장 중간 slash, `//명령`, slash 뒤 공백은 명령으로 오인하지 않는다.
- V1/V2 생성 동일성, ES5 파싱, CRLF/LF, 양식 콜론 변형, KST 자정, 재생 안정성을 포함한 계약 테스트 202개와 TypeScript 테스트 472개(합계 674개)가 통과했다.
- `npm run typecheck`, `npm run build`, `git diff --check`가 통과했다. lint는 오류 0개이며 생성 압축본의 기존 unused 경고 15개가 있다.
- `npm run security:secrets`가 현재 트리와 전체 Git 이력에서 고신뢰 비밀 패턴 0건으로 통과했다.
- 휴대폰 설치본은 62,570자(<65,535), SHA-256 `fdf7d5b83705cd352abf13cc8f0daae8f640129c5e540f3a3f7b45f85c85b70f`이다.

## 인증 장애 판정

- 운영 근거: 13:34:22, 14:10:41, 14:19:12 실패는 모두 `openchat` 401 / 내부 `ROOM_FORBIDDEN`; 14:16:18은 같은 서버 배포에서 `openchat` 200 후 `/recruits` 201.
- 기준 코드 e408에서도 공개 `openchat`, `recruits`, `operation-forms`는 sender를 전역 차단하지 않았다. 따라서 sender env가 위 실패 원인은 아니다.
- V41의 room ID 입력에는 identity secret과 `trim(String(room))`만 쓰이며 sender, 메시지, slash는 쓰이지 않는다.
- 결론: 서버/소스에서 정확한 단일 원인은 미확인이다. 가능한 원인은 서로 다른 봇 실행기/사본의 identity secret·설치본 불일치 또는 callback room 문자열화 차이다. 실패 요청의 room ID를 서버 로그에 남기지 않는 보안 경계상 기기 비교 없이 둘을 구분할 수 없다.
- R7은 기존 room ID 호환을 위해 NFKC/zero-width 제거/내부 공백 축약을 도입하지 않는다. allowed-room wildcard도 사용하지 않는다.

## 메타데이터 계약

- `》시작시간 :` 값은 앞뒤 공백만 제거해 보존한다. 비어 있으면 서버 생성 시각의 Asia/Seoul `HH:mm`을 저장하고 응답에 반영한다.
- `》게임정보 :` 값은 앞뒤 공백만 제거해 보존한다. 비어 있으면 정확히 `미입력`을 저장하고 응답에 반영한다.
- `모이면`, `일겜or자랭` 같은 자유 텍스트를 그대로 보존한다.
- 정식 양식 신규 생성/기존 파티 동기화와 slash/무슬래시 임시 생성이 같은 서버 저장값을 사용한다.
- migration `0029_eminent_dreadnoughts.sql`은 두 필드를 영속화한다.

## 미확인·남은 위험

- 실제 MessengerBot R/Rhino 기기 컴파일, 카카오 callback 객체 형태, 각 기기 identity secret 일치 여부는 미확인이다.
- 운영 DB migration, 서버 배포, 휴대폰 설치, 실제 방 end-to-end는 수행하지 않았다.
- 기존 파티 행의 시작시간은 생성 당시 값을 복원할 수 없어 migration 기본값 `미정`을 사용한다. 새 파티부터 서버 시각이 저장된다.
- 휴대폰 붙여넣기 과정의 줄 잘림은 설치 후 버전·문자 수·SHA-256과 실제 기기 컴파일로 확인해야 한다.

## 다음 패치 추천

1. 운영 기기별 고정 probe room ID와 `/V2연동확인` room ID를 비교해 secret 불일치와 callback 입력 차이를 분리한다.
2. 실제 MessengerBot R 버전별 callback 인자 타입/문자열화 결과를 비밀 없는 로컬 진단으로 수집한다.
3. preview DB에 0029를 적용해 create → 양식 sync → status → replay → finish 전체 흐름을 검증한다.
4. 설치본 해시 자동 확인 절차를 운영 체크리스트에 연결해 여러 봇 사본 혼용을 방지한다.
5. room 문자열 정규화가 필요하다는 기기 증거가 나오면 충돌 검사와 구/신 ID dual-read 이관을 별도 패치로 진행한다.
