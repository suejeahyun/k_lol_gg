# K-LOL.GG Audit Phase 7 Notes

## 목적

Phase 6 이후 남은 P1 `PAGINATION_REVIEW` 중 CSV 백업을 제외한 운영 API 일부에 명시적인 조회 상한을 추가했습니다.

## 주요 변경

- 이벤트/멸망전 참가자 가져오기 API에 1회 처리 상한 추가
- 이벤트/멸망전 참가자/대진 생성 결과 조회에 `take` 추가
- 시즌 참가 신청자 조회에 당일 최대 100명 상한 추가
- 통계 일관성 검사에 기본 상한과 응답 `limits` 정보 추가
- 카카오톡 내전현황 조회에 당일 신청/대기 조회 상한 추가
- 내전 수정 검증용 플레이어/챔피언 조회에 요청 크기 기반 `take` 추가
- OCR 챔피언 이미지 후보 조회에 상한 추가

## 의도적으로 유지한 항목

- `/api/admin/backup/*.csv`는 CSV 백업 기능이므로 전체 데이터 export 목적을 유지합니다.
- AI 학습은 전체 데이터 기반이 원칙이지만, 과도한 데이터로 인한 timeout 방지를 위해 기본 10,000 세트 상한을 둡니다.

## 새 환경 변수 선택값

필수는 아닙니다. 필요할 때만 `.env`에 추가하면 됩니다.

```env
BALANCE_RECOMMENDATION_TRAIN_GAME_LIMIT=10000
ADMIN_STATS_CONSISTENCY_PARTICIPANT_LIMIT=20000
ADMIN_STATS_CONSISTENCY_STORED_STAT_LIMIT=5000
```

## 확인 기준

1. `npm run build` 성공
2. `npm run audit:project` 성공
3. `npm run audit:risk`에서 P1 pagination 항목 감소
4. 공개 smoke test 성공
5. 이벤트/멸망전 참가자 가져오기와 대진 생성 화면 정상
