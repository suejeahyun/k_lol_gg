# 사이트 참가 신청의 대상 결합 계약

2026-10-14 사이트·카카오 신뢰성 수정에서 적용한다. ADR 0007의 소유권·revision·멱등성 계약과 ADR 0012의 실제 내전 식별 규칙을 보완한다.

`POST /api/applications/season`과 `DELETE /api/applications/season`은 기존 `If-Match`, `Idempotency-Key`, 인증·same-origin 검증에 더해 다음 `target`을 JSON body에 요구한다.

```json
{
  "recruitNo": 1,
  "target": {
    "seasonId": "11111111-1111-4111-8111-111111111111",
    "applyDate": "2026-10-14",
    "roundId": null,
    "applicationId": null
  }
}
```

- `seasonId`, `applyDate`, `roundId`는 마지막으로 확인한 모집 대상이다. `roundId`는 실제 내전 UUID이며 기존 기본 회차에 내전 행이 없을 때만 `null`이다. GET 응답의 `round.id`에서 얻는다.
- `applicationId`는 편집 중인 본인 신청 UUID이며 신규 신청일 때만 `null`이다. 취소·재신청도 기존 본인 신청 UUID를 유지한다.
- 서버는 같은 저장 트랜잭션에서 운영일(06:00 KST), 활성 시즌, 잠근 내전과 본인 신청의 실제 UUID를 확인한다. 불일치하면 `412 APPLICATION_TARGET_CHANGED`로 거절하며 다른 날짜·시즌·같은 번호의 새 대상에 적용하지 않는다.
- `target` 누락은 `428 APPLICATION_TARGET_REQUIRED`, 잘못된 값·누락된 내부 필드·추가 필드는 `400 INVALID_INPUT`이다. 배포 전 열린 구버전 화면은 최신 화면을 불러와야 한다. 읽기 API와 카카오 서명 API 계약은 변경하지 않는다.
- 성공한 동일 요청의 멱등 재실행은 기존 결과만 반환한다. 운영일이 바뀌어도 새 대상을 쓰지 않는다. 미완료 이전 요청의 날짜는 현재 날짜로 치환하지 않는다.
- 공개 HTTP 경계는 `target`을 필수 검증한다. 기존 내부 서비스 호출의 선택적 target 호환은 공개 요청의 필수 검증을 우회하는 경로로 사용하지 않는다.

화면은 날짜·시즌·모집 변경 때 작성한 입력을 유지하고 최신 대상을 비교한다. `현재 모집에 내 입력 사용` 또는 `입력 버리고 최신값 사용`을 명시적으로 선택하기 전에는 저장·취소를 막는다. 회차 링크로 이동하는 명시적 탐색은 해당 회차의 새 편집 상태를 연다.
