# 관리자 이벤트 진행 표시

2026-10-07, 1.0.7 이후 후속 수정. root가 격리 최적화 브라우저에서 신규 이벤트 상세의 `POSITION` 및 `PLANNED` 등 여섯 단계 코드가 화면과 접근성 트리에 그대로 표시되는 것을 확인했다. 이 담당자는 공유 브라우저·서버·운영 데이터를 조작하지 않았다.

## 원인과 변경

`src/app/(admin)/admin/progress/event/[eventId]/page.tsx`는 header에 `event.settings.format`, 진행 목록에 `stage`를 직접 출력했다. 기존 `public-display-labels.ts`의 `publicCompetitionFormatLabel`과 `publicEventStatusLabel`을 재사용해 방식과 단계의 한국어 이름을 표시한다. 같은 Page의 참가자 행도 포지션·등록 출처·상태 enum을 직접 출력했다. 포지션은 기존 `competitionPositionLabel`을 재사용하며 null은 포지션 구분 없음으로 표시한다. 참가자 출처 3종과 상태 2종의 기존 표시 사전은 없어 페이지 안의 타입으로 제한한 한국어 사전을 사용한다. 알려지지 않은 값은 원문 코드를 출력하지 않고 확인 필요 상태로 표시한다. 새 API·공통 컴포넌트는 추가하지 않았다.

실제 enum, 단계 순서, 현재 단계의 `aria-current="step"`, action 입력 상태, ADMIN 권한 확인과 공개 페이지 링크는 유지한다. 설정 폼 및 command handler, CSS, DB·권한 계약은 변경하지 않는다. AGENTS/PROJECT_RULES 및 로컬 Next `03-layouts-and-pages.md`를 다시 읽고, 이벤트 도메인의 두 format과 참가자·lifecycle 타입을 대조했다.

## 실행 근거

- `tests/event-settings-edit.test.mjs`의 기존 실제 Page loader를 재사용해 페이지 표시 회귀를 추가했다. repository·인증은 합성 대역이며 실제 TSX와 실제 표시 함수를 실행한다.
- [수정 전](event-display-before.log): 새 실제 Page 회귀 FAIL. 기대 한국어 단계 대신 여섯 내부 enum이 렌더됐다.
- [참가자 수정 전](event-participants-before.log): 합성 참가자 행의 실제 Page SSR에서 한국어 포지션·출처 표시 회귀 FAIL. 직접 신청·명단 가져오기·관리자 등록과 ACTIVE/CANCELLED를 구성하여 같은 원인을 확인했다.
- [수정 후](event-display-after.log): 기존 설정·이벤트 화면 회귀를 포함해 최종 14 PASS. 두 방식 × 여섯 상태에서 한국어 방식/단계, 정확한 현재 단계, ADMIN 권한 조회, 공개 링크와 원본 action 상태 전달을 검증했다. 참가자 이름 보존·취소 구분·출처 3종·null/알 수 없는 포지션·미지 코드의 복구 표시·활성 참가자 수와 원본 action 자료도 확인했다. 기존 revision 변경 시 설정 초기화 검증을 유지했다. 이 검사의 repository는 대역이므로 실제 DB seed/브라우저 통과로 세지 않는다.
- 최종 [변경 파일 ESLint](event-display-lint.log)와 [TypeScript](event-display-typecheck.log) exit 0(성공 시 출력 없음), scoped diff 공백 검사 통과.

## 관련 화면 조사와 남은 범위

멸망전 상세의 일반 header·단계는 이미 `competitionPreliminaryFormatLabel`·`DESTRUCTION_STATUS_LABEL`을 사용한다. 같은 raw enum 출력 원인은 발견되지 않았다. 실시간 경매 header의 `LIVE AUCTION CONTROL` 및 일부 별도 actions의 `SUPER_ADMIN` 문구는 다른 표시 영역이므로 root에 보고했고 수정하지 않았다.

새 build·실제 브라우저·통합 check·배포는 root 후속 검증이다. 이 담당자가 실제 클릭 또는 운영 반영을 완료한 것으로 세지 않는다.
