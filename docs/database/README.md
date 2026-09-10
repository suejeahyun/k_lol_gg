# 데이터베이스 문서

## ERD 생성 기준

`ERD.md`는 `src/platform/db/schema/index.ts`가 내보내는 Drizzle PostgreSQL 테이블을
기준으로 자동 생성한다. 생성기는 Drizzle의 스키마 메타데이터만 읽으며 환경 변수, 로컬·운영
DB, 외부 서비스에 연결하지 않는다. 따라서 ERD의 기준은 실제 DB introspection 결과나 과거
migration SQL이 아니라 현재 애플리케이션 스키마 소스다.

```bash
npm run db:erd
npm run db:erd:check
```

- `db:erd`는 테이블, 컬럼, PK·FK·단일 컬럼 UK, FK cardinality를 namespace별 Mermaid로
  다시 생성한다. 입력이 같으면 byte 단위로 같은 결과를 만들며 내용이 같으면 파일을 다시 쓰지
  않는다.
- `db:erd:check`는 파일을 수정하지 않고 현재 생성물과 스키마를 비교한다. 차이가 있으면 실패하므로
  스키마 변경 PR에서 생성물 누락을 잡을 수 있다.
- 생성물 상단의 SHA-256은 `src/platform/db/schema` 아래 TypeScript 파일명과 내용을 정규화해
  계산한다. 운영 데이터나 비밀값은 fingerprint 입력에 포함되지 않는다.
- `ERD.md`는 생성물이므로 직접 수정하지 않는다. 설명이 필요하면 이 문서나 별도 ADR에 기록한다.

## 변경 흐름

1. `src/platform/db/schema`의 스키마와 필요한 migration을 수정한다.
2. `npm run db:generate`로 생성한 migration SQL을 검토한다.
3. `npm run db:erd`로 ERD를 갱신한다.
4. `npm run db:erd:check`와 프로젝트 검증 명령을 실행한다.
5. 스키마, migration, ERD를 같은 기능 변경 근거로 묶는다.

ERD 일치는 소스와 문서의 드리프트만 검증한다. migration 적용 여부와 운영 DB 반영 여부를
증명하지 않으므로, 배포 판단에는 migration journal·배포 로그·운영 검증 근거가 별도로 필요하다.
