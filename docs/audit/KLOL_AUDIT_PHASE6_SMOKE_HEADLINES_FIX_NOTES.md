# K-LOL.GG Phase 6 Smoke Headlines Fix

## 목적

`/api/community/headlines` smoke test가 400으로 실패하는 문제를 수정한다.

## 원인

`/api/community/headlines`는 `type` query parameter가 필수다. 기존 smoke script가 `/api/community/headlines`를 query 없이 호출하여 정상적으로 400을 반환했다.

## 처리

- smoke test 호출 URL을 `/api/community/headlines?type=FREE`로 변경
- `tools/audit-klol-smoke-plan.mjs`도 같은 URL을 생성하도록 수정
- Windows PowerShell 5.1 호환 문법 유지

## 확인

```powershell
PowerShell -ExecutionPolicy Bypass -File `
  "docs/audit/generated/KLOL_SMOKE_TEST_PUBLIC_READ.ps1" `
  -BaseUrl "http://localhost:3000"
```