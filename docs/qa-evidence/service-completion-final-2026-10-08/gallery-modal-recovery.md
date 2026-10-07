# 멸망전 갤러리 확대창 키보드 복구

## 문제와 최소 수정

기존 공개 멸망전 상세의 확대 이미지는 서버에서 `aside role="dialog" aria-modal="true"`로만 렌더링됐다. 이미지 주소와 닫기 링크는 있었지만 확대창으로 초점을 옮기거나 Tab 이동을 제한하고 Escape로 닫는 동작이 없어, 키보드 사용자가 배경으로 이동하거나 닫은 뒤 보던 이미지 위치를 잃었다. 기존 페이지의 실제 JSX를 실행한 [수정 전 회귀](gallery-modal-before.log)는 4 FAIL·1 PASS다. 마지막 이미지·주소 보존 조건은 원래도 통과했다.

`gallery-lightbox.tsx`에만 작은 client 경계를 추가했다. 브라우저 `dialog.showModal()`로 배경 조작을 막고 닫기 링크에 초기 초점을 둔다. 확대창의 유일한 조작 요소인 닫기 링크에서 Tab·Shift+Tab을 유지하며 Escape는 기존 `?tab=gallery` 링크를 누르는 동작과 같다. 닫힘·뒤로 가기로 컴포넌트가 해제되면 본문 스크롤과 원래 썸네일 초점을 복원한다. 이미지가 높거나 제목이 길면 내부에서 스크롤할 수 있다.

기존 `imageIndex` URL, 이미지 ordinal·주소·대체 텍스트, `scroll={false}`, Next Link의 이력 정책, 서버 조회·권한·잘못된 주소 처리는 유지한다. 기존 배경색·이미지 크기·테마를 재사용하고 native dialog 기본 테두리·여백만 정규화했다. 새 라이브러리·API·DB 변경은 없다. `ResilientMediaImage`의 실패 fallback에도 추가 버튼이나 링크가 없어 현재 단일 닫기 Tab 정책과 일치한다.

## 검증

- `tests/destruction-gallery-dialog.test.mjs`: 실제 async 페이지와 새 client 컴포넌트를 실행한다. 초기 modal/초점, 양방향 Tab, Escape의 기존 닫기 경로, 해제 시 스크롤/썸네일 복원, 기존 이미지·URL을 확인한다. React effect/ref·DOM dialog·Next Link·저장소는 합성 대역이며 외부 요청이나 DB 쓰기를 하지 않는다.
- 기존 `tests/destruction-ui-contract.test.mjs`의 페이지 소스 토큰은 이동한 `role="dialog"` 대신 실제 `DestructionGalleryLightbox` 연결을 확인하도록 바꿨다. 동작은 위 실제 컴포넌트 회귀에서 확인하며 기존 계정/관리자 경계 검사를 유지했다.
- [수정 후 focused](gallery-modal-after.log): 새 5조건과 기존 3조건, 총 8 PASS.
- 해당 페이지·컴포넌트·두 테스트의 ESLint exit 0. [출력 파일](gallery-modal-lint.log)은 경고·오류가 없어 0바이트다.
- 다른 담당자 `security_data_audit`가 제품 수정이나 재실행 없이 page/client/CSS/회귀를 독립 읽기 검토했다. 새 material finding은 없었다. native 모달, 같은 닫기 URL, 원본 썸네일 초점, 내부 스크롤, 변경되지 않은 권한·이미지 조회를 대조했다.

DOM 대역의 `showModal()` 호출만으로 실제 브라우저의 top layer·inert·Next client navigation을 통과했다고 간주하지 않는다. root가 통합 check/build와 새 격리 최적화 서버의 실제 키보드·화면 검증을 담당한다. 이 문서의 focused 결과는 모바일 실기기·운영 배포 후 갤러리 확인 결과가 아니다.

## 격리 브라우저 fixture 진입 경로

아래는 source에서 확인한 준비 절차이며 이 담당자가 DB·서버·브라우저를 실행한 기록이 아니다. 현재 root의 `final-v109` 하니스가 만든 **새 ready 파일의 origin**을 사용한다. 이전 ready의 포트·UUID를 재사용하지 않는다.

`scripts/test-db/run-data-contracts.ts`의 `fixtures.sourceIds.destructionId`는 마지막 수정 대회이고 `galleryId`는 READY 자산이 있는 별도 게시 갤러리다. 둘의 연결이나 대회의 본선/종료 상태를 보장하지 않는다. 또한 새 Next 프로세스의 fake storage에 미리 들어가는 bytes는 경기접수 이미지 한 장뿐이므로 기존 갤러리 DB 행의 READY 상태가 실제 이미지 bytes 존재를 보장하지 않는다.

1. 합성 관리자 로그인 후 `/admin/progress/destruction`에서 **본선 또는 종료**인 합성 대회를 고른다. `/admin/progress/destruction/{id}`에 `대회 갤러리`가 있어야 한다. 과거 단계 보기 중이면 현재 진행 단계로 돌아간다. `SET_MEDIA_GALLERY`의 UI와 서버 모두 TOURNAMENT/COMPLETED만 허용한다. keyboard fixture를 만들기 위해 진행 중 대회 상태를 직접 덮어쓰지 않는다.
2. 기존 게시 갤러리의 실제 이미지가 보이면 `게시된 갤러리`에서 선택 후 `갤러리 반영`으로 연결할 수 있다. 그림까지 필요한 검증에서 기존 이미지가 없으면 `/admin/images/new`의 제목·설명과 합성 PNG 1장을 입력하고 `초안 만들고 1장 등록` → 편집 화면의 `게시`를 사용한다. PNG/JPEG/WebP, 장당 최대 4MiB·최대 5장이라는 기존 제약을 따른다.
3. 새 게시 갤러리를 위 합성 대회의 `게시된 갤러리`에서 선택하고 `갤러리 반영`한다. 공개 `/competitions/destruction/{id}?tab=gallery`에서 실제 썸네일을 누른다. 실제 ordinal이 0이면 `?tab=gallery&imageIndex=0`으로 직접 진입할 수도 있다.
4. 초기 닫기 초점, Tab/Shift+Tab, Escape, 닫기 클릭, 브라우저 뒤로 가기, 원본 썸네일 초점과 body overflow 복원을 실제 DOM으로 확인한다. 새 PNG를 사용했다면 이미지 정상 표시도 별도로 확인한다.

이 경로는 기존 실제 UI 과업을 실행하는 방법이다. 대신 별도 도메인/서버 fixture 연결을 사용했다면 그것은 **키보드 검증의 setup**으로만 기록해야 하며 갤러리 생성·게시·대회 연결 UI 완료로 세면 안 된다. 이 담당자는 현재 runner DB를 수정하지 않았다.

격리 모드의 `FakePrivateImageStorage.stageAt/read`는 같은 프로세스의 global Map을 사용하고 미디어 업로드·공개 이미지 조회도 같은 runtime storage를 공유한다. 따라서 새 UI 업로드는 외부 Blob을 소비하지 않는다. 이 모드는 loopback origin·test DB·QA 플래그가 모두 맞는 경우만 허용되며 Vercel에서는 선택되지 않는다. 운영 갤러리나 실회원 자산을 fixture로 변경하지 않는다.
