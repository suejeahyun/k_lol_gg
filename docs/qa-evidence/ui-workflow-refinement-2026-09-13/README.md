# UI·운영 흐름 보완 검증 근거

## 판정

- 기록일: 2026-09-13
- 기능 커밋: `fd819b0c5fd19957b95ecff3d2708da61f8d5ce7`
- Git tag: `ui-workflow-refinement-v1.0.0`
- DB migration: 없음, head `0037_swift_brood` 유지
- 운영 배포: **완료** (`dpl_48xow9mENhg2BrSAZyFdBD4giJQZ`)
- 운영 DB 변경·삭제: **하지 않음**

요구한 계정 티어 입력, 홈 우승 사진, 상세 캐러셀, 구인 참가자 공개, 내전 시간 제거, 이벤트 대회·멸망전 분리는 소스·합성 DB·브라우저 검증을 거쳐 운영 별칭에 반영했다.

## 요구사항별 결과

### 내 정보 티어 변경

- 아이언부터 다이아몬드까지 7개 티어와 4개 단계, 총 28개 선택지를 제공한다.
- 마스터·그랜드마스터·챌린저는 티어를 선택한 뒤 0~9,999 LP만 직접 입력한다.
- 현재 티어와 최고 티어가 같은 공통 입력기를 사용한다.
- 기존 한글·영문 티어 문자열을 편집 상태로 복원하고 저장 시 정규형 문자열로 변환한다.
- Riot ID 변경 경고, revision, If-Match, 멱등성 키와 재연결 정책은 유지했다.

### 홈·갤러리 이미지

- 홈의 일반 갤러리 목록을 `멸망전 우승 사진` 캐러셀로 교체했다.
- 완료된 멸망전과 연결된 게시 갤러리를 우선 사용한다.
- 운영 데이터의 기존 연결 누락을 위한 제한적 fallback은 `PUBLISHED`, `showOnHome`, 제목에 `멸망전`과 `우승`이 모두 있는 갤러리만 허용한다.
- `/images/[imageId]`도 같은 캐러셀을 사용하며 이전·다음, 직접 이동, 좌우 키보드, `aria-live`와 모바일 레이아웃을 제공한다.
- 저장소의 제6회 멸망전 우승 이미지 5개는 production build 서버에서 모두 HTTP 200·`image/webp`로 확인했다.

운영 읽기 전용 확인에서 `7fccf96c-9d07-46e9-ac7f-5d41105a66c1`은 `제 6회 멸망전 우승`, `showOnHome=true`, 외부 이미지 5개였다. 다만 완료된 멸망전 row의 `galleryId`는 비어 있어 현재는 제한적 fallback이 필요하다. 배포 후 관리자에서 해당 멸망전과 갤러리를 명시적으로 연결하면 fallback 의존을 제거할 수 있다.

### 구인·내전·대회

- `/recruits` 공개 카드에 참가자 이름, 포지션과 예비 여부를 표시한다.
- 공개 DTO는 이름·포지션·슬롯·예비 여부만 추가하며 방 ID, 발신자 ID, 계정 ID와 내부 원문은 노출하지 않는다.
- 내전 경기 등록 화면에는 진행 시간 입력을 두지 않고 공개 상세의 `N분 N초` 표시도 제거했다.
- 기존 `durationSeconds`는 저장 호환과 migration 회피를 위해 내부 1,800초 기본값으로만 유지한다.
- `/competitions/events`와 `/competitions/destruction`을 독립 목록으로 만들고 상세·관리자·신청·레거시 이동도 각 유형의 canonical 경로로 분리했다.
- `/competitions`는 두 유형을 선택하는 진입 화면이며 기존 `?type=` 링크는 해당 독립 목록으로 영구 이동한다.

## 검증 결과

- `npm run check`: PASS
  - ESLint 오류 0, 생성·호환 bot의 기존 경고 37
  - TypeScript PASS
  - Drizzle ERD 102 tables / 165 foreign keys
  - 테스트 747개 중 746 PASS, DB 전용 1 intentional skip, 실패 0
  - 여성 챔피언 홈 아트 68/68, 1672×940, SHA-256 중복 0
  - Next production build static generation 93/93
- `npm run test:db`: PASS
  - migration·실제 PostgreSQL 계약·복구 훈련 PASS
  - 본인 Riot ID/티어 키보드 저장, 재렌더, 412 충돌 복구 Chromium PASS
- `npm run qa:capture:full`: PASS
  - 105 pages / 339 captures / issue 0 / affected 0
  - anonymous 109, account 39, admin 188, setup 3
  - production data 포함 없음, 자격증명 저장 없음
- 멸망전 우승 정적 이미지: 5/5 HTTP 200, `image/webp`
- `git diff --check`: PASS

요약 보존본은 [SUMMARY.json](./SUMMARY.json), 운영 공지는 [DISCORD_NOTICE.md](./DISCORD_NOTICE.md), 재현 방법은 [전체 페이지 QA 실행서](../FULL_PAGE_QA_RUNBOOK.md)에 있다. 원본 339개 PNG와 경로별 index는 `.tmp/full-page-qa`에 생성했다.

## 남은 운영 조건과 위험

1. 이 커밋을 Vercel Production에 배포한 뒤 운영 alias health와 홈·구인·갤러리·대회 대표 화면을 재검증해야 한다.
2. 운영의 완료 멸망전 row와 제6회 우승 갤러리 FK를 명시적으로 연결한 뒤 fallback 없이 조회되는지 확인해야 한다.
3. 합성 QA의 예전 private asset은 실제 Blob을 사용하지 않아 대체 이미지 안내가 보인다. 실제 Vercel Blob 업로드·읽기·정렬·삭제 E2E는 별도 운영 검증이 필요하다.
4. 참가자 이름을 공개하기로 한 정책 변경은 반영했지만, 운영 공지에 공개 범위를 알리고 신고·비공개 요구 대응 정책을 확정하는 것이 좋다.
5. 실제 모바일 터치와 스크린리더의 캐러셀 탐색은 자동 Chromium 검사만으로 완전히 대체되지 않는다.

## 다음 패치 추천

1. 멸망전 결과 확정 시 우승 갤러리를 필수 연결하거나 게시 전 경고하는 관리자 검증을 추가한다.
2. 캐러셀 이미지 preload를 현재 사진과 다음 사진 1장으로 제한해 모바일 전환 체감을 계측한다.
3. 구인 참가자 공개 정책을 관리자 설정으로 제어하고 변경 이력을 감사 로그에 남긴다.
4. 티어 선택기에 최근 Riot 동기화 값과 수동 수정 시각을 함께 표시해 데이터 출처를 분명히 한다.
5. 운영 배포 뒤 홈 우승 사진·상세 캐러셀의 실제 Core Web Vitals와 이미지 실패율을 수집한다.
