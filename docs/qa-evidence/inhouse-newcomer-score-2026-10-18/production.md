# 내전 점수 표시 2.0.1 운영 근거

현재 상태: 배포 준비. 실제 배포 ID·소스 SHA·운영 주소 확인 후 아래 상태를 갱신한다.

변경은 적용 점수와 티어·표본의 구분 표시, 잘못된 티어 문자열의 엄격 검증이다. 정상 티어의 점수 가중치, 조합 규칙 1→6, 자동 조정 정책 및 과거 초안 JSON을 유지한다. migration head는 `0049_stable-recruit-codes`이며 스키마 migration이 없다.

## 검증 범위

[전체 검사](README.md), [실제 입력 재현과 독립 비교](comparison.md). 운영 초안 조회는 소유자 인증을 거친 공식 GET과 화면에서 수행했다. 진단용 운영 초안 생성·개인 보정 변경은 하지 않았다. 사용자 확인 티어의 등록과 재평가는 관리자 인증 및 실제 저장 확인과 별도로 구분한다.

## 복구 기준

직전 검증 런타임은 source `1bf379eddcda98a338f41781529c23ac885baed5`, deployment `dpl_cRoMJfC7eaPPwjXvX3ZwzHTF2hD4`, immutable URL `https://k-lol-h0o817epl-tjdmswo11-3715s-projects.vercel.app`이다. 런타임 이상 시 이 배포로 운영 alias를 복구하고 health와 인증 경계를 다시 확인한다. DB 스키마나 과거 초안을 되돌리는 작업은 필요하지 않다. 등록 티어 수정 및 재평가를 별도로 수행했다면 코드 배포 복구가 해당 자료 변경을 자동 취소하지는 않는다.
