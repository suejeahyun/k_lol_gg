# ADR 0007: 로컬 DB용 Docker는 필요성 확인 전 도입하지 않는다

- 상태: 채택
- 날짜: 2026-09-11

## 배경

프로젝트의 DB 계약은 PostgreSQL 18을 기준으로 한다. 현재 CI는 `.github/workflows/data-contract.yml`의 PostgreSQL service를 사용하고, 로컬 DB·복구 검사는 `PG_BIN_DIR`로 지정한 PostgreSQL 18 실행 파일과 loopback·test DB 이름·명시적 test mode 안전 가드를 사용한다. 애플리케이션 실행 자체는 Docker에 의존하지 않는다.

## 결정

현재는 Dockerfile, Compose 파일과 영속 volume을 추가하지 않는다. 기존 로컬 PostgreSQL 18 및 CI service 경로가 fresh migration, upgrade, 복구와 HTTP 계약을 재현하므로 별도 컨테이너 계층의 유지 비용을 정당화할 확인된 문제가 없다.

## 재검토 조건

아래 중 하나가 실제로 발생하고 재현 근거가 남을 때 별도 ADR로 Docker 도입을 검토한다.

- 신규 기여자가 지원 OS에서 PostgreSQL 18 설치 또는 `PG_BIN_DIR` 설정 때문에 DB 검사를 재현하지 못한다.
- CI와 로컬의 extension, locale, timezone 또는 major version 차이로 같은 migration 결과가 달라진다.
- 여러 서비스가 추가되어 한 명령으로 격리된 개발 토폴로지를 올릴 필요가 생긴다.

도입한다면 PostgreSQL major 고정, loopback 전용 포트, 합성 데이터, test 전용 DB 이름, 일회성 volume, healthcheck와 명시적 삭제 범위를 필수로 한다. 운영 Neon 자격증명이나 데이터를 로컬 Compose에 주입하지 않는다.

## 결과

- 새 로컬 의존성과 중복 실행 경로가 생기지 않는다.
- 현재 DB 검증은 `npm run test:db`와 `npm run verify:recovery`를 유지한다.
- Docker 미도입은 DB 검사를 생략한다는 뜻이 아니며, 필요성 증거가 생기면 이 결정을 갱신한다.
