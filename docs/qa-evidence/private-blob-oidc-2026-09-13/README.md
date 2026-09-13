# Vercel Private Blob OIDC 연결 QA

## 판정

- 기능 ID/버전: `private-blob-oidc@1.0.0`
- 상태: 소스 반영·통합 게이트·기능 커밋·태그 완료, 푸시·운영 배포 전
- 기능 커밋: `b48465ac781d5f17679e4911cebc03b0d50aec8f`
- Git tag: `private-blob-oidc-v1.0.0`
- DB migration: 없음, migration head `0037_swift_brood` 유지
- 운영 데이터 변경: 없음

## 확인된 운영 원인

- Vercel 저장소 `k-lol-gg-blob`은 Private·Available 상태이고 프로젝트 `k-lol-gg`에 연결되어 있다.
- 현재 연결은 OIDC 방식이며 Production·Preview에 `BLOB_STORE_ID`와 `BLOB_WEBHOOK_PUBLIC_KEY`를 제공한다.
- 기존 런타임은 `BLOB_READ_WRITE_TOKEN`만 준비 상태로 인정해 연결된 OIDC 저장소를 `UNAVAILABLE`로 오판했다.
- `BLOB_WEBHOOK_PUBLIC_KEY`는 업로드 인증값이 아니다.
- 비밀값은 열람·출력·코드 기록하지 않았다.

## 구현 계약

- 올바른 `BLOB_STORE_ID`가 있으면 OIDC를 우선한다.
- SDK의 `put/get/del`에는 `storeId`만 전달하며 `token`과 `oidcToken`은 전달하지 않는다.
- `@vercel/blob@2.8.0`이 요청 컨텍스트의 OIDC 자격증명을 매번 취득·갱신한다. 만료 가능한 토큰을 전역 객체에 저장하지 않는다.
- store ID가 없을 때만 유효한 `BLOB_READ_WRITE_TOKEN`을 기존 호환 경로로 사용한다.
- 둘 다 없거나 malformed이면 `UNAVAILABLE`로 닫힌다.
- 기존 deterministic storage key, overwrite 금지, 동일 digest 재시도, PNG/JPEG/WebP·4MiB·컨테이너 종료·SHA-256·경로 검사를 유지한다.
- 업로드 저장소 미구성은 `PRIVATE_STORAGE_UNAVAILABLE` 503과 `Cache-Control: no-store`로 구분한다.

## 검증

- Private Blob·private asset·media 집중 테스트: 25/25 PASS
- media resilience 계약: 1/1 PASS
- OIDC 옵션 검증: put/get/del 모두 `storeId`만 포함하고 token 원문 없음
- 레거시 token fallback과 malformed store ID fail-closed PASS
- 저장소 미구성 503 문제 응답·no-store PASS
- 담당 검증: 전체 단위 테스트 748 PASS, 1 intentional skip; ESLint·typecheck·production build PASS
- `git diff --check`: PASS
- 전체 화면 회귀: 105 pages / 339 captures / HTTP·레이아웃 issue 0 / 종료 코드 0
- 이미지 편집 화면 실캡처에서 기존의 저장소 미연결 차단 안내가 나타나지 않고 비공개 자산 상태가 정상 표시됨

## 운영 확인 계획

- 배포 뒤 지정 이미지 편집 화면에서 저장소 미연결 안내가 사라지고 파일 선택 입력이 열리는지 확인한다.
- 운영 데이터 비변경 smoke에서는 파일을 실제 선택·업로드하지 않는다.
- 실제 OIDC 쓰기 검증은 전용 초안과 삭제 흔적·감사 기록을 수반하므로 별도 운영 쓰기 승인 범위에서 수행한다.

## 다음 권장 패치

1. 관리자 상태 화면에 비밀값 없이 `OIDC 연결/레거시 토큰/사용 불가` 모드만 표시한다.
2. Preview 전용 Private Blob과 격리 DB로 upload→read→delete 실제 E2E를 자동화한다.
3. OIDC 운영이 안정화되면 사용하지 않는 장기 `BLOB_READ_WRITE_TOKEN`을 Vercel에서 회수한다.
4. Blob 오류 코드와 trace ID를 관리자 장애 안내에 연결한다.
