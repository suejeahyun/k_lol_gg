# HTTP mutation foundation

Route Handler는 Next 전용 응답 타입 없이 WHATWG `Request`/`Response` 기반의 이 모듈을 공통으로 사용한다.

```ts
import {
  formatRevisionEtag,
  idempotencyHashMaterial,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);

  const body = await readJsonBody(request, { maximumBytes: 16 * 1024 });
  if (!body.ok) {
    return problemResponse(problemForJsonBodyError(body.error), { traceId });
  }

  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) {
    return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  }

  const expected = readIfMatchRevision(request.headers);
  if (!expected.ok) {
    return problemResponse(problemForIfMatchRevisionError(expected.error), { traceId });
  }

  const keyMaterial = idempotencyHashMaterial(idempotency.key, "players:update");
  // keyMaterial은 저장소 계층에서 SHA-256 해시한 뒤 사용하며 원문과 함께 기록하지 않는다.
  const updated = await updatePlayer(body.value, expected.revision, keyMaterial);

  return noStoreJsonResponse(updated.value, {
    status: 200,
    traceId,
    headers: { ETag: formatRevisionEtag(updated.revision) },
  });
}
```

- `problemResponse`에는 공개 검토된 `definePublicProblem` 결과만 전달한다. 잡힌 `Error`, stack, SQL 문구는 응답 정의에 넣지 않는다.
- `Idempotency-Key`는 대소문자를 보존한다. 원문 또는 해시 재료를 로그에 남기지 않는다.
- `If-Match`는 DB 계약과 같은 0 이상의 정수 revision을 강한 ETag(`"0"`, `"1"`)로 받는다.
- 읽기 목록은 `parsePaginationInput(new URL(request.url).searchParams)`로 cursor 중복과 limit 상한을 먼저 검증한다.
- 인증·권한 검사와 실제 DB 트랜잭션/멱등성 저장은 각 기능의 application/infrastructure 계층에서 결합한다.
