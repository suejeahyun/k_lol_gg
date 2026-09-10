# 검증 증거

검증일: 2026-09-10

## 자동 검증

| 명령 | 결과 |
| --- | --- |
| `npx tsx --test tests/kakao-v4-installation-scope.test.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-server-acceptance.test.ts tests/recruiting-application.test.ts tests/kakao-v2-transition.test.ts` | 54/54 통과 |
| `npm run check` | 종료 코드 0 |
| `npm run lint` (`npm run check` 포함) | 오류 0, 기존 경고 25 |
| `npm run typecheck` (`npm run check` 포함) | 통과 |
| 계약 테스트 (`npm run check` 포함) | 275/275 통과 |
| 단위 테스트 (`npm run check` 포함) | 596/596 통과 |
| 홈 가이드 아트 검증 (`npm run check` 포함) | 68명/68개, SHA-256 중복 0 |
| Next.js 프로덕션 빌드 (`npm run check` 포함) | 92/92 정적 페이지 생성, 종료 코드 0 |
| `npm run build-messengerbot:v4` | RECRUIT 8,700자, FEATURES 8,829자 생성 |
| 생성 전후 V4 산출물 normalized diff | 차이 없음 |
| `node scripts/check-secrets.mjs --tree-only` | 현재 추적·미추적 트리 고신뢰 비밀 패턴 0 |

전체 Git 이력 비밀 검사는 blob별 프로세스 구조로 장시간 종료되지 않아 중단했다. 위 표는 통과가 확인된 현재 작업 트리 검사만 증거로 삼는다.

## 요구사항별 증거

- 교차 사용자 공유: 같은 installation scope에서 사용자 A 생성, 사용자 B 전체 양식 수정과 마감.
- 프로필 격리: RECRUIT/FEATURES installation ID와 내부 범위가 서로 다름.
- 콜백 방 무시: 두 V4 전화 엔트리를 격리 실행하고 room/channel/group 값만 바꾼 두 호출의 전송 인자가 동일함을 확인.
- 인증 실패 폐쇄: 임의 installation ID, 타 프로필 installation ID, 변조된 current/previous 서명 거부.
- 재생 내구성: 중복 mutation 한 번 적용/한 번 재생, 같은 event ID의 다른 body는 409.
- 라우트 격리: V4 route 소스에 room registry 의존성이 없고 7필드 계약 유지.
- V3 회귀: `tests/kakao-v2-transition.test.ts` 포함 집중 실행 및 전체 계약/단위 검사 통과.

## 변경하지 않은 운영 상태

- 운영 서버 배포: 수행 안 함.
- 운영 DB 조회·변경·마이그레이션: 수행 안 함.
- 실제 환경 변수/비밀값 조회·출력·생성·회전: 수행 안 함.
- push: 수행 안 함.
