# 내전 점수 표시 2.0.1 운영 근거

현재 상태: **PRODUCTION**. source `48e82aef77d0dc69d30d1bbccf34b3938437c85a`, tag `inhouse-fairness-v2.0.1`.

- 후보: `dpl_HSVUnFYjg9RMKMCuPxuRnbmxsPTu`, [provider 근거](candidate-provider.json), [인증된 배포 보호 경유 HTTP 8조건 PASS](candidate-http.json).
- main 운영: `dpl_BNbgQurdEkcrstoJEdkinsv8Ke8Z`, immutable `https://k-lol-fwynqbv5j-tjdmswo11-3715s-projects.vercel.app`, canonical `https://k-lol-gg.vercel.app`.
- 운영 READY 시각 `2026-10-17T15:12:28.286Z`; [동일 source·READY·alias 확인](production-provider.json), [운영 HTTP 8조건 PASS](production-http.json).
- [실제 소유 초안 브라우저 확인](browser.json): 10개 카드가 적용 점수를 표시, 잘못된 기본 50 문구 0개, 원래 1회 평가/SAVED 보존. 현재 viewport 2458px에서 가로 넘침 없음. 이미지 캡처 도구가 응답하지 않아 DOM 검증만 기록한다.
- [source GitHub CI 39043947042](source-ci.json) success: 비밀정보 검사, production 의존성 감사, 전체 check, 관리자 HTTP 검증을 모두 통과했다.

변경은 적용 점수와 티어·표본의 구분 표시, 잘못된 티어 문자열의 엄격 검증이다. 정상 티어의 점수 가중치, 조합 규칙 1→6, 자동 조정 정책 및 과거 초안 JSON을 유지한다. migration head는 `0049_stable-recruit-codes`이며 스키마 migration이 없다.

## 검증 범위

[전체 검사](README.md), [실제 입력 재현과 독립 비교](comparison.md). 운영 초안 조회는 소유자 인증을 거친 공식 GET과 화면에서 수행했다. 진단용 운영 초안 생성·개인 보정 변경은 하지 않았다. 사용자 확인 티어의 등록과 재평가는 관리자 인증 및 실제 저장 확인과 별도로 구분한다.

## 남은 운영 자료 수정

사용자가 확인한 현재 골드 IV·최고 골드 II 입력을 적용하면 기준 43.4점, 해당 원딜 부포지션 38.4점이며 독립 재추천의 팀 합계 차이는 1.90점이다. 운영 등록부 편집 화면은 별도 관리자 로그인을 요구하므로 저장하지 않았다. 기존 초안도 재평가·재저장하지 않았다. 관리자 로그인 후 등록 티어를 저장하고 초안을 재평가한 실제 결과로 이 상태를 갱신해야 한다.

## 복구 기준

직전 검증 런타임은 source `1bf379eddcda98a338f41781529c23ac885baed5`, deployment `dpl_cRoMJfC7eaPPwjXvX3ZwzHTF2hD4`, immutable URL `https://k-lol-h0o817epl-tjdmswo11-3715s-projects.vercel.app`이다. 런타임 이상 시 이 배포로 운영 alias를 복구하고 health와 인증 경계를 다시 확인한다. DB 스키마나 과거 초안을 되돌리는 작업은 필요하지 않다. 등록 티어 수정 및 재평가를 별도로 수행했다면 코드 배포 복구가 해당 자료 변경을 자동 취소하지는 않는다.
