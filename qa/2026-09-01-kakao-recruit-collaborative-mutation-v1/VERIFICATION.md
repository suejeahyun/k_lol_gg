# 검증 기록

## 자동 검사

| 검사 | 결과 |
| --- | --- |
| `npm run check:kakao-policy-session` | PASS |
| `npm run check:kakao-recruit` | PASS |
| `npm run check:kakao-recruit-replies` | PASS |
| `npm run check:kakao-auth` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npx eslint src/lib/kakao/policy.ts` | PASS |

## 회귀 시나리오

| 시나리오 | 기대 결과 | 자동 검사 |
| --- | --- | --- |
| 최초 작성자가 직접 수정·마감 | 허용 | PASS |
| 같은 모집의 다른 사용자가 수정·마감 | 허용, `operatorOverride=false` | PASS |
| 과거 오류로 `roomName`이 작성자명으로 저장된 모집 | 다른 사용자도 허용 | PASS |
| 등록 운영자가 명시적 대리처리 | 허용, `operatorOverride=true` | PASS |
| 허용 방 설정이 존재하고 다른 방에서 join/finish | 상위 정책에서 403 차단 | PASS |
| `8ㅉ` 등 파티 마감 명령 파싱 | 기존 파싱 유지 | PASS |

## 운영 대조

- 확인됨: 2026-08-31 생성 운영 파티 표본은 `roomName === hostName` 형태였고, 이전 파티 표본은 고정 라벨 `K롤방 구인구직방`을 사용했다.
- 확인됨: 제보에서 작성자 본인의 #8 수정과 #9 마감은 성공하고, 다른 사용자의 #8 수정 및 #2·#4·#5·#8 마감은 소유권 오류로 실패한 패턴과 일치한다.
- 미실행: 운영 API에 실제 sync/finish 요청. 활성 모집을 변경하므로 자동 스모크에서 제외했다.
- 확인됨: 커밋 `0dbf59e`의 Vercel Production 배포 `EEkrLVVzf7LgWrupkcUiJXCF4YBK`가 `Ready`다.
- 확인됨: 운영 별칭 `/api/health`가 HTTP 200, `ready`, database `ok`를 반환했다.
- 참고: 배포 고유 URL은 Vercel 보호 화면을 반환해 공개 health 판정에는 운영 별칭을 사용했다.
- 미실행: 운영 DB 쓰기, 카카오봇 단말 교체.

## 영향 파일

- `src/lib/kakao/policy.ts`
- `tools/check-kakao-policy-session.ts`

빌드가 자동 변경한 `next-env.d.ts`는 원래 상태로 복원했다. 기존 UI 작업과 사용자 변경 파일은 수정·스테이징하지 않았다.
