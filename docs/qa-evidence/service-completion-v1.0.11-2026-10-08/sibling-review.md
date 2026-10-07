# 이벤트·내전 신청의 모집 상태 우선 표시

## 확정한 문제와 최소 수정

P2 두 곳을 실제 컴포넌트/페이지 렌더로 재현했다. 이벤트 상세는 `open=false`여도 비로그인 사용자에게 “로그인하고 신청하기”, 미승인 사용자에게 계정 승인·연결을 먼저 안내했다. 내전 신청은 시즌 신청 기간 밖이거나 선택 회차가 닫혀 있어도 로그인·승인·활성 플레이어 연결을 신규 신청의 다음 행동처럼 안내했다. 서버는 이 신청을 허용하지 않으므로 로그인으로 해결할 수 없는 과업 경로였다.

- `event-application-actions.tsx`: 기존 `!open` 분기를 인증 안내보다 먼저 판정한다. 닫힌 신청에서는 다른 이벤트 모집으로 이동한다. 기존 승인 사용자가 보던 닫힘 표시, 상세 페이지의 본인 신청 조회 및 공개 참가·팀 명단은 그대로다. 종료 후 본인 신청 상세를 새로 추가한 변경은 아니다.
- `applications/page.tsx`: 서버가 계산한 `currentSeason.applicationsOpen`과 `round.closed`로 닫힌 모집을 먼저 표시한다. 별도 `myStatus` 카드는 유지하므로 기존 신청·예비·확정·거절·취소 상태와 날짜·회차·포지션·신청 출처를 계속 확인할 수 있다. 닫힌 회차의 비활성 폼은 기존 상태 카드로 대체되어 저장·취소를 다시 시도하도록 유도하지 않는다.
- 정상 모집의 인증 안내, 이벤트 `?action=apply` 및 내전 선택 회차의 로그인 `next`, 기존 신청 수정·취소 및 폼 초기값은 보존한다. 원장·DTO·API·권한 정책은 수정하지 않았다.

도메인 근거: 이벤트 `eventAcceptsApplications`는 RECRUITING 상태와 신청 시작/종료 시각을 함께 검사하며 public DTO의 `applicationsOpen`과 mutation의 `APPLICATION_CLOSED`가 이를 재사용한다. 시즌 repository 역시 `seasonAcceptsApplications` 및 `round.closed`를 `canApply`에 적용하고, 승인 회원의 본인 신청은 신청 가능 여부와 별개로 조회한다. 페이지에 시간·권한 계산을 복제하지 않았다.

## 관련 화면 검토

파티 모집과 기존 스크림 공개 현황에서는 같은 원인의 신규 신청 로그인 유도를 확인하지 못했다. 파티 공개 조회는 IN_PROGRESS만 선택하며 정원이 찬 항목은 정원 마감과 최신 명단의 빈자리·예비 칸 확인을 구분한다. 명령 복사 완료는 “참가 미완료”로 표시한다. 기존 스크림은 “신규 참가 종료”로 표시한다. 따라서 이 화면은 수정하지 않았다. 활성 모집만 변경할 수 있는 조건과 종료 상태 보존은 `KAKAO_V4_V1_COMPATIBILITY_CONTRACT.md`의 활성 회차 및 스크림 종료 계약과도 대조했다.

## 실행 검증

기존 `tests/application-navigation.test.mjs`의 실제 Page/React SSR 하니스를 재사용했다. 별도 하니스나 제품 추상화를 추가하지 않았다.

| 증거 | 결과 |
|---|---|
| `sibling-lifecycle-before.log` | 원본 제품 + 새 회귀 10건 중 8 PASS / 2 FAIL. 실제 닫힘 화면의 로그인 유도 HTML 보존 |
| `sibling-lifecycle-after.log` | 수정 후 navigation 10건 + 기존 event-ui-contract 3건 = 13 PASS |
| `sibling-lifecycle-lint.log` | 두 제품 파일 및 회귀 파일 focused ESLint exit 0, 출력 없음 |
| `sibling-lifecycle-typecheck.log` | `npm run typecheck` exit 0 |

닫힘 회귀는 시즌 기간 밖/회차 마감 × 비로그인·제한·승인 × 활성 플레이어 유무, 승인 회원의 다섯 기존 상태를 검사한다. 이벤트는 닫힘 × 세 인증 상태 × 미신청·ACTIVE·CANCELLED 및 정상 모집의 복귀 주소/신청 수정·취소를 검사한다. 실제 반환된 요소와 HTML을 검사하며 데이터의 상태 조건을 기대 문자열에 맞춰 바꾸지 않았다. `git diff --check`도 exit 0이다.

release_inventory의 별도 읽기 검토에서 두 제품 diff, 서버의 신청 가능 조건, 실제 Page/SSR 전후 로그를 대조했고 새 차단 문제는 없었다. 루트에 source freeze를 알렸으며 통합 검사·브라우저·배포는 루트의 별도 근거로 기록한다.

## 검증 경계와 브라우저 확인 경로

이 증거는 합성 데이터의 실제 페이지/컴포넌트 렌더 및 정적 계약 검증이다. 실제 브라우저 로그인, 외부 카카오 동작, 운영 신청 mutation을 실행했다는 의미가 아니다. 서버·DB·인증 변경이 없으므로 이 수정에서 운영 데이터는 사용하거나 변경하지 않았다.

- 닫힌 이벤트 `/competitions/events/<id>?action=apply`: 비로그인/미승인에서도 `#event-application`은 신청 기간 상태와 “다른 이벤트 모집 보기”만 표시한다.
- 정상 모집 이벤트의 “로그인하고 신청하기”: 로그인 `next`는 같은 이벤트의 `?action=apply`이다.
- 닫힌 내전 `/applications?type=season&recruitNo=2`: 신규 신청 로그인·계정 연결 CTA가 없고 기존 승인 회원의 `#my-status-title` 및 해당 회차 기록은 남는다.
- 정상 모집 내전: 비로그인 로그인 `next`가 선택 회차를 보존하고 제한 회원/미연결 회원의 계정 복구가 남는다.

이번 검토는 공개 신청 경로의 상태·인증 순서에 한정한다. 파티의 현재 종료/명단 조회 목적을 인증 문제로 취급하거나 별도의 신청 기능을 추가할 근거는 없었다.
