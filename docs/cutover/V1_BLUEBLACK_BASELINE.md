# V1 블루·블랙 기준과 운영 복원 원칙

## 확인된 기준

- Git commit: `8d4d2a491fd8647186502505054d68883a09a834`
- Git tree: `0fec8208644d08959d3a71dae10f9738b13c1bfd`
- Vercel deployment: `dpl_GTcgeUUY8wwemLhoYjEYRMRTjQpC`
- 당시 운영 별칭: `https://k-lol-gg.vercel.app`
- 로컬 기준 작업 트리: `E:\k-LOL.GG\6.k_lol_gg_v1_blueblack_baseline`

## 중요한 보안 조건

위 커밋은 정확한 시각·기능 기준이지만 이후 반영된 다음 개선이 없다.

- 고위험 의존성 취약점 해소
- 공개 개인정보 최소화
- 공개 플레이어·경기 API 보호
- 접근성·모바일 경로 보강
- 비공개 자산 관리

따라서 과거 배포를 그대로 운영에 재승격하지 않는다. 실제 V1 운영 후보는 최신 보안 변경을 보존하면서 Bright Bloom UI만 제거한 블루·블랙 버전으로 별도 제작·검증한다.

## 강화 후보 v3 보존 상태

- 코드 커밋: `27ff39847a215c48383205ad4c00920cfc5a23a5`
- 코드 tree: `65aa4f98ffd6bae2eb561b0f7ddee1e9c04d7b30`
- QA 증거 커밋: `4ea222922a7a32a9f72a1bea014409881ea64304`
- 로컬 후보 작업 트리: `E:\k-LOL.GG\8.k_lol_gg_v1_blueblack_hardened`
- 검증: clean checkout `npm run check`, PostgreSQL 18.3의 102개 migration, 합성 데이터 기반 `/`·`/app` 고유 marker, 공개 5경로 HTTP 200, RSC·Prisma 연결 오류 부재, Android/OG 자산 계약 통과
- 정리: 격리 DB cluster 정상 종료, 임시 runtime/cache 제거, 잔여 listener 0, worktree clean

강화 후보 v3도 현재 배포 판정은 **NO-GO**다. 기존 Git 이력 secret 검사가 종료 코드 1이며, 비밀값·일치 커밋·상세 결과를 열람하거나 allowlist로 우회하지 않았다. 또한 인증된 관리자 전체 경로 검증은 완료되지 않았다. 이 후보는 V1 복구 연구용으로만 보존하며 V2 이력에 병합하지 않는다.

## 금지

- 기존 작업 트리 reset 또는 삭제
- 과거 배포의 무검증 즉시 promote
- 운영 DB·환경 변수 변경
- V2와 V1의 실시간 이중 쓰기
