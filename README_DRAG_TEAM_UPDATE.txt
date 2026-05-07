# 관리자 팀 드래그 구성 업데이트

## 적용 내용

- 이벤트 내전 관리자 상세: `/admin/progress/event/[eventId]`
  - 자동 생성된 팀의 참가자 카드를 드래그해서 다른 팀으로 이동 가능
  - 저장 시 `/api/event-matches/[eventId]/teams` PUT 호출
  - 대진표가 생성된 이벤트는 수정 차단
  - 이벤트 내전은 각 팀 5명 조건 검증

- 멸망전 관리자 상세: `/admin/progress/destruction/[tournamentId]`
  - 기존 셀렉트 기반 팀 배정 대신 드래그 팀 구성 UI 적용
  - 팀장은 `팀장 고정`으로 표시하고 드래그 불가
  - 저장 시 기존 `/api/destruction-tournaments/[tournamentId]/assign-teams` PUT 호출
  - 경기가 생성된 멸망전은 수정 차단

## 교체 방법

프로젝트 루트에서 기존 `src`, `prisma`를 삭제 후 ZIP 안의 `src`, `prisma`, `eslint.config.mjs`를 붙여넣으세요.

```powershell
Remove-Item -LiteralPath "src" -Recurse -Force
Remove-Item -LiteralPath "prisma" -Recurse -Force
Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
```

이후 실행:

```powershell
npx prisma generate
npm run lint
npm run build
```

이미 속도 개선 3안 마이그레이션을 적용했다면 `migrate deploy`는 다시 필수는 아닙니다. 그래도 배포 전에는 아래를 한 번 실행해도 됩니다.

```powershell
npx prisma migrate deploy
```
