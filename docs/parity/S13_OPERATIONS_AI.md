# S13 운영·AI 동등성

## 구현 계약

- 전역 도우미는 공개 설정의 `features.aiAssistant`가 `true`일 때만 브라우저에 표시된다.
- 질문 전송은 승인 계정 세션, 역할 allowlist, `If-Match`, `Idempotency-Key`, 시간당 요청 수와 일일 비용 상한을 모두 통과해야 한다.
- 질문 원문은 DB·감사 로그에 저장하지 않는다. 원장에는 프롬프트 SHA-256, 문자 수, 토큰 수, 추정 비용, 성공/실패 코드만 남긴다. 동일 멱등 요청에 같은 응답을 돌려주기 위한 답변은 일반 감사 원장이 아니라 제한된 command receipt에만 보관하고 운영 retention 정리 대상에 포함한다.
- OpenAI 어댑터는 `V2_OPENAI_COMPLETION_ENABLED=true`와 모든 환경값이 유효할 때만 활성화된다. 일부 값만 설정된 상태에서는 disabled 어댑터로 fail-closed한다.
- 외부 요청은 고정된 HTTPS Responses API endpoint, 제한된 응답 크기, timeout, redirect 거부, `store:false`, 명시적 출력 토큰 상한을 사용한다.
- 모델과 토큰 단가는 코드가 추측하지 않는다. 운영자가 현재 계약값을 환경 변수로 명시해야 한다.

## 검증 경계

- fake HTTP 응답으로 요청 본문·비밀값 비노출·출력 텍스트 집계·토큰/비용 계산·401/429/비정상 응답 차단을 검증한다.
- 실제 OpenAI 자격 증명, 실제 과금 호출, 운영 feature 활성화는 이 코드 검증 범위에 포함하지 않는다.
- 공식 요청 형식 근거: https://developers.openai.com/api/docs/guides/text
