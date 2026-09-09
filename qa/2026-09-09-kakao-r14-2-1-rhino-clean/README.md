# Kakao R14.2.1 Rhino 정적 경고 제거 QA

상태: public source·generator·private handoff installer 생성과 로컬 검증 완료. 실제 휴대폰 교체·컴파일 smoke는 미수행이다.

## 원인

R14.2 기능에는 문제가 없었지만, Terser가 명시적 `if` 문을 standalone comma sequence, `조건 && 호출`, 조건식 expression statement로 다시 압축했다. MessengerBot R Rhino 정적 검사는 이 패턴을 `CODE HAS NO SIDE EFFECTS`로 경고한다.

## 변경

- R14.2 installation scope, HMAC V3, pairing, sender role, 명령 101개와 서버 요청 계약은 변경하지 않았다.
- 생성기의 최종 ES5 AST에서 standalone sequence/logical/conditional/pure/void expression statement를 명시적인 `if`·호출·대입 문장으로 변환한다.
- 중첩 comma sequence의 버려지는 피연산자는 값과 평가 순서를 유지하는 명시적 호출로 감싸고, bare assignment 조건과 빈 loop body도 Rhino 경고가 없는 형태로 바꾼다.
- 생성 직후 Acorn ES5 parser가 Rhino 1.7.13의 실제 side-effect 판정 규칙을 모사해 전체 AST를 검사하고 후보가 하나라도 있으면 빌드를 실패시킨다.
- 별도 `bot:kakao:rhino-audit`로 public/private 설치본을 같은 규칙으로 검사한다.
- 휴대폰 편집기용 주기적 줄바꿈을 유지하면서 CRLF 기준 65,535자 미만을 강제한다.

## 검증

| 항목 | 결과 |
| --- | --- |
| public/private `node --check` | 통과 |
| Acorn ES5 parse | 통과 |
| 실제 Rhino 1.7.13 strict/fatal-warnings compile | 경고 0 · 통과 |
| Rhino warning candidate | 0 |
| unsafe nested comma operand | 0 |
| standalone logical/conditional/pure expression | 0 |
| void expression | 0 |
| bare assignment condition | 0 |
| ESLint `no-unused-expressions` | 0 |
| V41 command audit | 101개 유지 |
| contract test | 최종 실행 결과 참조 |
| unit test | 최종 실행 결과 참조 |

## 산출물

| 구분 | 문자/CRLF/바이트 | SHA-256 |
| --- | ---: | --- |
| public mobile | 64,845 / 64,943 / 76,468 | `5994b77ce8692dec92f180f2422b8f841839a72ee0c678690f0d3eea12243220` |
| public complete | 122,178 / 124,957 / 133,939 | `c0e230977c3cc3a9daf868d9001eeb092a3cb40c8354925b4b2e182b64c8656f` |
| private mobile | 65,237 / 65,336 / 76,860 | `2228039d59cce2019b095dfaebfe034261095711b6e33114df797fc994767d24` |

Private installer는 저장소 밖 `E:\k-LOL.GG\_handoff\kakao-r14-2-1-rhino-clean-20260909`에 있다. 기존 private 설정 4개의 key/value는 메모리상 exact equal로 확인했고, 설정 fingerprint는 `5c6eb8aacd588ee6339b839da1226fbb6c8d6947845fd91448af8f9957f5d665`로 보존했다. 비밀 원문은 출력·커밋하지 않았다.

## 배포 판단

이미 R14.2 서버와 migration 0033이 적용된 환경에서는 서버·DB 계약 변경이 없으므로 Production 재배포가 필요 없다. 휴대폰 private installer만 전체 교체하고 컴파일·실명령 smoke를 수행한다. R14.2 서버가 아직 적용되지 않았다면 기존 R14.2 운영 인계 순서대로 server/migration을 먼저 적용해야 한다.

## 다음 권장 사항

1. 실제 MessengerBot R 컴파일 화면에서 warning 0을 캡처한다.
2. `/봇버전`, `/V2연동확인`, `/V2진단` 결과에서 installation ID가 R14.2와 같은지 확인한다.
3. `5인파티`, `2인파티`, `/구인현황`, 외출 양식의 slash/무슬래시 smoke를 실행한다.
4. 이후 generator 변경마다 Rhino audit를 CI 필수 단계로 실행한다.
