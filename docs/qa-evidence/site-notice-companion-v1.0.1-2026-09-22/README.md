# 사이트 알림 companion 1.0.1 — 설치 진단 소스 QA

- 작성일: 2026-09-22 KST
- 기준 소스: `c2d0dcbd` 이후 공개 companion 변경. 최종 commit/tag는 총괄 릴리스에서 연결한다.
- 버전: `KLOL_SITE_NOTICE_COMPANION_1.0.1`
- 범위: 공개 JS, 폰 합성 검사, 설치 안내. 서버 프로토콜·DB·일반 R25 봇은 이 패치에서 변경하지 않았다.
- 상태: 공개 소스와 로컬 합성 검증. 비공개 설치본 생성·운영 설정·휴대폰 설치·실제 충원 수신은 별도 통합 절차다.

## 변경과 경계

`사이트알림상태`와 `사이트알림버전`을 정확히 입력하면 휴대폰의 버전·활성 여부·수신 세션 등록 여부를 확인할 수 있다. OFF에서도 로컬 조회를 허용하지만 REGISTER/POLL/ACK, 설정 변경, 원장 변경, 대상 세션 교체는 하지 않는다. 상태를 조회한 방이 알림 수신 대상이라고 추측하지 않는다. `com.kakao.talk` 그룹 콜백만 허용하며 슬래시·추가 공백·일반 명령은 처리하지 않는다.

등록 성공·실패·OFF·이미 등록됨을 고정된 한국어 문구로 안내한다. 실패하면 새 코드가 담긴 설치본으로 교체 후 다시 등록하도록 안내한다. 등록코드·대상 hash·URL·설정·서버 원문을 응답에 넣지 않는다. 결과 안내의 SDK 호출이 실패해도 성공한 세션 등록을 되돌리지 않는다.

기존 FEATURES scope, 등록 콜백 replier 고정, 재시작 시 등록 해제, PREPARED/SENT 영속 중복 방지, 불명확 전송의 자동재발송 억제를 유지한다. 상태 응답과 등록 성공 안내는 실제 충원 알림 전달 증거가 아니다.

## 실행 근거

| 검사 | 결과 |
|---|---|
| `node --test tests/kakao-site-notice-phone.test.mjs` | 11 tests PASS, 0 fail/skip |
| 위 검사에 포함된 ES5 parser·Rhino 정적 분석 | PASS, 경고 후보 없음 |
| 상태·버전·OFF·등록 실패·다른 세션·실제 `response()`·재컴파일 | 서버 큐 호출/대상 교체 없이 기대 상태 확인 |
| 기존 ACK 손실·재시작·불명확 전송·잘못된 target·stale lease·저장 실패 | 회귀 PASS |
| `npx eslint tests/kakao-site-notice-phone.test.mjs` | exit 0 |
| 변경 파일 `git diff --check` | exit 0 |

공개 소스 파일 SHA-256: `ea70ab1e8cca35dddf9436df5d069dd8911f014582f10bc37cfcd38bbc63e58f`. LF 9,575자 / CRLF 9,749자로 두 형식 모두 65,535자 미만이다. 비밀 설정이 들어간 비공개 설치본의 해시는 별도로 기록한다.

## 실기기 확인

사용자는 일반 R25의 버전·구인현황·내전현황 성공 로그를 제공했다. 이는 별도 companion의 설치나 백그라운드 송수신 성공을 뜻하지 않는다. MessengerBot R 0.7.29a에서 이번 버전·상태 명령, 등록 결과, 잠금화면 poll, 실제 SITE 충원 전달, 재시작 후 재등록을 확인해야 한다. [설치 안내](../../../integrations/messengerbot-r/site-notices/README.md)를 따른다.

다음 확인은 실제 대상 세션 등록, 30초 타이머·절전 상태 유지, 오프라인 재연결/불명확 전송 복구다. 이번 QA에서는 외부 메시지를 발송하지 않았다.

## 통합 배포·설치본 준비

source `c3442ace1e04054ada05f1f6842f4699b45a0bb6`, Vercel `dpl_BdpAWrcHPKAchNU9K644dHfajNxu`의 사이트 알림 서버를 활성화했다. 기존 target 일치, 후보·운영 HMAC REGISTER 성공, nonce 재사용 거절을 확인했다. 이 REGISTER는 서버 경계 점검이며 휴대폰 설치 증거가 아니다.

활성 비공개 설치본은 10,388자, SHA-256 `c845948a4f5b53919476be40233e31e4415070088f09e797e44f3bd9831c532e`다. JS·setup JSON·개인 등록 문구가 들어간 안내의 ZIP 3개 항목이 원본 해시와 일치한다. 등록 비밀값은 공개 문서/Git에 넣지 않는다. 실기기 교체·수신은 계속 `PENDING_USER_INSTALL`이다. [최종 통합 QA](../integrations-activation-v1.0.0-2026-09-22/README.md)를 따른다.
