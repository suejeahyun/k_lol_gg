# V2 팀 밸런스 V1 코어 호환 QA

## 확인 근거

- V1 기준 커밋: `8d4d2a491fd8647186502505054d68883a09a834`
- V1 계산 원본: `src/lib/team-balance/calculate.impl.ts`
- V1 공유 원본: `src/components/team-balance/TeamBalancePage.impl.tsx`의 `buildCopyText`
- 확인됨: 10명, TOP/JGL/MID/ADC/SUP, 미선택 라인 AUTO, 5:5 분할 126개, 팀별 120개 포지션 순열 중 V1 우선순위 최고안, 전체 후보 AI 비교의 단일 최고안을 사용한다.
- 확인됨: 공유는 `BLUE ...`, `RED ...`, `밸런스 판단: ...` 3줄 클립보드 텍스트이며 링크·이미지·공개 토큰을 만들지 않는다.
- V2 안전 적용: 공유 이름은 비공개 회원명이 아니라 초안의 닉네임 스냅샷을 사용하고 줄바꿈을 제거한다.
- 미확인/데이터 없음: V1 `PlayerSoloMatch` 상세과 `balanceOverrideScore`는 V2 이관 대상에 없다. 해당 항목은 추정하지 않고 V1의 데이터 없음/0 경로로 계산하며 화면에 알린다.

## 검증 결과

- `npm exec -- tsx --test tests/team-balance-domain.test.ts`: 12/12 통과
- `npm run typecheck`: 통과
- `npm run build`: Next.js production build 통과
- `npm run test:contracts`: 347/347 통과
- `V2_DB_CONTRACT_SCOPE=team-tools npm run test:db`: 격리 PostgreSQL 계약 1/1 통과
- `V2_DB_CONTRACT_SCOPE=mmr npm run test:db`: 활성 시즌·V1 MMR 경계 포함 격리 PostgreSQL 계약 1/1 통과
- `V2_DB_CONTRACT_SCOPE=all npm run test:db`: 선행 statistics 상태를 유지한 전체 순서에서 S06 팀 밸런스 계약 통과. 이후 별도 `recruiting.contract.test.ts:249`의 `0 !== 1` 실패로 전체 명령은 중단됐으며 팀 밸런스 변경과의 연관은 확인되지 않았다.
- `npm exec -- eslint ...`: 오류 0 (수정 전 경고를 제거한 뒤 타입/빌드 재검증)
- 운영 반영: 미반영. 커밋·푸시·배포하지 않았다.

## 운영 문구 회귀 감사

- 팀 밸런스 초안 목록의 metadata·H1·팀 도구 메뉴에서 개인 소유형 `내 초안` 표현을 제거하고 `팀 밸런스 초안`으로 통일했다.
- 시작 화면의 과거 3안 안내를 V1 단일 추천 안내로 교체했다.
- 자동 적용·수동 교체·결과 접수에서 남은 `팀 후보 선택`, `교체 시작`, `끌어서 이동` 문구를 현재 동작인 팀 배치 적용·카드 교체 표현으로 정리했다.
- 소유자/관리자 조회 권한, 서버 재평가·저장·결과 등록 계약은 변경하지 않았다.
- `node --test tests/team-tools-ui.test.mjs`: 5/5 통과
- `npm run typecheck`: 통과
- `npm run test:contracts`: 347/347 통과
- 변경 범위 `git diff --check`: 오류 없음

## 다음 패치 추천

1. V1 최근 솔랭 20경기 원본의 이관 가능 여부를 운영 DB 백업으로 확인한다.
2. V1 관리자 보정값을 별도 감사 원장으로 이관할지 정책을 확정한다.
3. 익명화한 실제 V1 10인 입력/출력 골든 픽스처를 만들어 양쪽 결과를 대조한다.
4. 모바일 360px·키보드 교체·화면 공유 환경의 브라우저 QA 캡처를 추가한다.
