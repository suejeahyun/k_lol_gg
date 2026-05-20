# K-LOL.GG 안정화 패치 요약

이 ZIP은 운영 중인 배포본에 바로 덮어쓰기 가능한 안전 패치입니다. 기존 운영 데이터를 삭제하지 않는 방향으로 구성했습니다.

## 반영 내용

1. 카카오 플레이어 조회 페이지 오류 수정
   - `/kakao` 페이지가 존재하지 않는 `/api/kakao/web-player-search`를 호출하던 문제를 해결했습니다.
   - 웹 전용 JSON 응답 API `/api/kakao/web-player-search`를 추가했습니다.

2. 구인구직 마무리 hard delete 제거
   - 카카오 구인 마무리 시 `RecruitParty`를 삭제하지 않고 `FINISHED` 상태로 보관합니다.
   - 참가자와 구인 기록을 DB에 남겨 추후 복구·감사·분석이 가능하도록 했습니다.

3. 모집번호 구조 보강
   - 기존 `recruitDate + resetSeq + recruitNo` unique 구조를 유지합니다.
   - `RecruitPartyStatus.FINISHED` enum migration을 추가했습니다.
   - 과거 `recruitNo` 단일 unique 제거 migration은 기존 파일을 유지합니다.

4. 관리자 API 1차 차단 강화
   - `/api/admin/*` 요청에 proxy 레벨 1차 권한 차단을 추가했습니다.
   - 개별 route guard가 빠지는 사고를 줄이기 위한 보조 방어입니다.

5. SUPER 관리자 메뉴 노출 개선
   - 일반 ADMIN에게 SUPER 전용 메뉴가 보이지 않도록 클라이언트 필터를 추가했습니다.

6. 랭킹 API 기준 통일
   - `/api/rankings` 기본값을 참여 10회 이상으로 맞췄습니다.
   - 필요 시 `?minParticipation=0`으로 전체 조회할 수 있습니다.

7. 검증 도구 누락 보완
   - `package.json`에서 참조하던 `tools/*.mjs` 파일을 추가했습니다.
   - 관리자 API guard, 무제한 findMany 후보, 미사용 CSS 후보를 점검할 수 있습니다.

8. API 응답 공통 helper 확장
   - `src/lib/api-response.ts`에 `apiOk`, `apiFail`, `unauthorized`, `forbidden`, `notFound` 등을 추가했습니다.
   - 기존 코드 호환성을 위해 기존 함수명도 유지했습니다.

## 추가된 migration

- `prisma/migrations/20260520020000_add_recruit_party_finished_status/migration.sql`

운영 DB 적용 전 반드시 아래를 확인하세요.

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'RecruitParty'
ORDER BY indexname;
```

남아 있으면 위험한 인덱스/제약:

- `RecruitParty_recruitNo_key`
- `RecruitParty_recruitDate_recruitNo_key`

기존 migration `20260520010000_drop_legacy_recruit_no_unique_index`가 이를 제거합니다.
