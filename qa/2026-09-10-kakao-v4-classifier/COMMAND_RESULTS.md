# Command results

## 집중 테스트

```powershell
npm exec -- tsx --test tests/kakao-v4-command-classifier.test.ts tests/kakao-v4-command-gateway.test.ts
```

결과: `17 passed / 0 failed`

검증 항목:

- command parity 101개 전수 매핑
- 선행 slash 0/1 동등성
- double slash, URL, 중간 slash 거부
- V1 계약 fixture 전체 별칭
- RECRUIT/FEATURES 및 WRONG_PROFILE
- 파티·내전·스크림 SNAPSHOT 우선순위
- 선택형 파티 시작시간·게임정보
- 0명 전체 양식
- A→B→A 무상태 재분류
- 운영 양식과 내부 진단 분리

## 타입 검사

```powershell
npm run typecheck
```

결과: pass

## ESLint

```powershell
npm run lint
```

결과: exit 0. 기존 파일에서 경고 25개가 출력됐으며 신규 classifier와 테스트에는 오류·경고가 없다.

의존성이 없던 전용 worktree에서는 lockfile 변경 없이 `npm ci --ignore-scripts`를 먼저 실행했다. `node_modules`는 Git 추적 대상이 아니다.
