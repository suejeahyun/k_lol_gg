# 티어·단계 입력 구조 정정 검증

## 판정

- 기능 커밋: `fd87e5f47703f92f09e1d4db70617ee2aa49fc92`
- Git tag: `ui-workflow-refinement-v1.0.1`
- 운영 배포: **완료** (`dpl_48xow9mENhg2BrSAZyFdBD4giJQZ`)
- 운영 URL: `https://k-lol-gg.vercel.app/account?tab=player`
- DB migration·운영 데이터 변경: 없음

## 최종 UI 계약

- 왼쪽 티어 드롭다운: 아이언, 브론즈, 실버, 골드, 플래티넘, 에메랄드, 다이아몬드, 마스터, 그랜드마스터, 챌린저
- 오른쪽 보조 입력:
  - 아이언~다이아몬드: `1`, `2`, `3`, `4` 단계 드롭다운
  - 마스터~챌린저: 0~9,999 LP 정수 수기 입력
- 현재 티어와 최고 티어가 같은 `AccountTierField`를 재사용한다.
- 저장 형식은 기존 API·DB 호환을 위해 `GOLD II`, `DIAMOND IV`, `MASTER 120`을 유지한다.
- 기존 한글·영문, 숫자·로마자 단계와 마스터 이상 점수 문자열을 두 입력의 초기값으로 복원한다.

## 검증

- 집중 단위 테스트: 7/7 PASS
- 계정 계약 테스트: 4/4 PASS
- `npm run check`: PASS
  - ESLint 오류 0, TypeScript PASS
  - 전체 테스트 747개 중 746 PASS, DB 전용 1 intentional skip
  - production build static generation 93/93
- `npm run test:db`: PASS
  - 실제 PostgreSQL 저장 PASS
  - Chromium에서 `DIAMOND + 2`, `MASTER + 120 LP` 저장 PASS
  - 외부 동시 수정 뒤 HTTP 412 최신값 재마운트 PASS
- `npm run qa:capture:full`: 105 pages / 339 captures / issue 0 / affected 0 / 종료 코드 0
- 데스크톱 계정 캡처에서 티어는 왼쪽, 단계는 오른쪽에 정렬됨을 육안 확인
- `git diff --check`: PASS

자동 캡처 요약은 [SUMMARY.json](./SUMMARY.json), 공지는 [DISCORD_NOTICE.md](./DISCORD_NOTICE.md)에 있다.

## 운영 확인

- Vercel Production `Ready`, main `477651491ce9feef404f5cba186602f1fb481036`
- 운영 별칭 `/account?tab=player`에서 아이언~챌린저 티어 10종 확인
- 마스터 선택 시 오른쪽 `LP(점수)` 정수 입력 확인
- 다이아몬드 선택 시 오른쪽 `1`, `2`, `3`, `4` 단계 드롭다운 전환 확인
- 확인 뒤 마스터로 되돌렸으며 저장 버튼은 누르지 않아 운영 사용자 데이터 변경 없음
- `/api/health`, `/recruits`, `/competitions`, `/competitions/events`, `/competitions/destruction` 모두 HTTP 200

## 다음 패치 추천

1. LP 입력 옆에 Riot 마지막 동기화 시각을 표시해 수동 값과 공식 값의 출처를 구분한다.
2. 실제 승인 계정의 값 변경이 필요할 때 현재·최고 티어 저장과 재로그인 유지 여부를 추가 확인한다.
3. 모바일 실기기에서 긴 `그랜드마스터` 라벨과 4자리 LP 입력의 터치 영역을 확인한다.
