# K-LOL.GG 최종 팀 밸런스 / AI 판단형 MMR 시스템

## 핵심 변경

- 기존 공식 개선 제안형 구조 대신, 계산 시점의 3개 후보를 실제 운영 리스크 기준으로 추론하는 `AI 판단` 블록을 추가했습니다.
- AI 판단은 외부 AI API가 아니라 내부 데이터 기반 추론 엔진입니다.
- 내전 등록 후에는 내부 MMR을 갱신하고, `BalanceMatchReview`에 AI 판단 결과를 저장합니다.

## 포함 기능

1. 최고티어 60 / 현재티어 30 / 내전지표 10
2. 솔로랭 최근 20게임 폼 보정
3. 솔로랭 주/부포지션 추정
4. 신청 주/부포지션 비교
5. 라인별 영향도 배율
6. 주/부/AUTO 감점
7. 고티어 주포지션 우선
8. 총합 균형형 / 라인 균형형 / 포지션 만족형
9. 바텀 조합 보정
10. 미드-정글 조합 보정
11. 결과 카드 설명
12. 솔로랭 갱신 결과 표시
13. 관리자 수동 보정
14. 계산 품질 점수
15. AI 판단 기반 추천안 자동 표시
16. 내전 후 밸런스 피드백 저장
17. 내부 AI형 MMR 시스템
18. 내전 결과 기반 AI 추론 리뷰 저장

## 신규 마이그레이션

`prisma/migrations/20260510004000_add_ai_inference_judgement/migration.sql`

추가 필드:

- `BalanceMatchReview.aiVerdict`
- `BalanceMatchReview.aiRiskLevel`
- `BalanceMatchReview.aiConfidence`
- `BalanceMatchReview.aiInferredWinner`
- `BalanceMatchReview.aiReasoning`
- `BalanceMatchReview.aiRiskFactors`
- `BalanceMatchReview.aiFormulaVersion`

## 적용 후 확인 명령어

```powershell
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run build
```

## 테스트 포인트

- `/players/balance`에서 1/2/3안 계산 후 `AI 판단` 카드가 보이는지 확인
- `AI 판단`의 예상 승률, 위험도, 판단 근거, 리스크 항목 확인
- 내전 등록 후 `BalanceMatchReview`에 `aiVerdict`, `aiReasoning`, `aiRiskFactors`가 저장되는지 확인
- 다음 팀 밸런스 계산에서 내부 MMR 보정이 유지되는지 확인
