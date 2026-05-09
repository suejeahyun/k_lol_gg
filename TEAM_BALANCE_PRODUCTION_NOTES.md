# Team Balance Production Notes

## 반영된 운영 기준

- 기본 점수: 최고티어 60% + 현재티어 30% + 내전지표 10%
- 솔로랭 최근폼 보정: 최근 솔로랭 20게임 기준 -5 ~ +5
- 포지션 숙련도 보정: 내전 포지션 경험 + 솔로랭 최근 주 포지션 기준 -3 ~ +3
- 배정 감점: 주포지션 0, 부포지션 기본 -5, 자동배정 기본 -10
- 고티어 보호: 다이아2 이상/마스터 이상은 부포지션·자동배정 감점을 더 강하게 적용
- 3개 추천안:
  - 1안: 팀 총점 균형형
  - 2안: 고점 분산형
  - 3안: 포지션 만족형

## 운영 버튼

- 빠른 계산: 저장된 솔로랭/내전 데이터를 기준으로 즉시 계산
- 솔로랭 갱신 후 계산: 선택된 10명의 최근 솔로랭 20게임을 best-effort로 갱신한 뒤 계산

Riot API 제한, Riot ID 오류, 10분 쿨다운 등이 발생해도 팀 밸런스 계산은 계속 진행됩니다.

## 배포 전 필수 명령

```powershell
npm install
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run build
```

## 추가된 DB 필드

- Player.balanceOverrideScore
- Player.balanceOverrideReason
- TeamBalanceDraft.optionType/redTotal/blueTotal/diff/balanceCost
- TeamBalanceDraftPlayer.roleType/score/baseScore/soloBonus/positionBonus/rolePenalty

## 관리자 수동 보정 기준

- 범위: -10 ~ +10
- 추천 사용:
  - 최근 폼이 확실히 좋은 사람: +1 ~ +4
  - 휴면 복귀, 티어 대비 체감 하락: -2 ~ -6
  - 특정 라인 숙련도가 낮은 고티어: -2 ~ -5
  - 솔로랭을 안 하지만 내전 영향력이 큰 사람: +2 ~ +5
