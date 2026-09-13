# 비공개 이미지 저장소 OIDC 연결 v1.0.0

관리자 하이라이트·갤러리 편집 화면이 현재 Vercel Private Blob 연결을 인식하도록 인증 선택기를 보완했다.

- 연결된 저장소의 `BLOB_STORE_ID`를 우선 사용한다.
- `@vercel/blob`이 요청마다 OIDC 자격증명을 취득·갱신하도록 SDK에는 `storeId`만 전달한다.
- `VERCEL_OIDC_TOKEN`을 애플리케이션이 읽거나 저장하지 않는다.
- `BLOB_READ_WRITE_TOKEN`은 OIDC 저장소 ID가 없는 기존·로컬 환경에서만 호환 경로로 사용한다.
- 저장소가 없거나 식별자가 잘못되면 기존처럼 fail-closed 한다.
- 업로드 API는 저장소 미구성과 일반 서비스 장애를 구분해 안전한 503 문제 응답을 반환한다.

업로드 권한, 관리자 세션·2단계 인증, same-origin, `If-Match`, 멱등성, 4MiB 제한, PNG/JPEG/WebP 컨테이너·SHA-256 검사는 그대로 유지한다. DB migration과 운영 데이터 변경은 없다.

검증 상세와 디스코드 공지는 [`docs/qa-evidence/private-blob-oidc-2026-09-13/README.md`](../qa-evidence/private-blob-oidc-2026-09-13/README.md)에서 확인한다.

Vercel 운영 배포 `dpl_GJQWShTTiDt5DbM39MkMf3hzYRPc`와 공개 별칭 health를 확인했다. 운영 데이터 비변경 smoke에서는 실제 파일 업로드를 실행하지 않았다.
