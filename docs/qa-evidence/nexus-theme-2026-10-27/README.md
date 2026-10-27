# NEXUS 마스코트 테마 1.0.0 검증

- 날짜: 2026-10-27
- 대상: NEXUS 전용 서비스. 기존 K-LOL 서비스 분기는 유지.
- migration head: `0049_stable-recruit-codes` (DB/schema/권한 변경 없음)
- 배포 근거: 완료 후 같은 폴더의 production.json과 release registry에 기록.

## 구현

사용자가 제공한 NEXUS 원본 보드를 그대로 보관하고 CSS crop으로 NEXI 메인 배너와 NEXI/VEX/RIN/ZANE/LUMI 카드를 표시한다. 이미지 출처·SHA는 asset.json에 기록했다. Next Image가 한 최적화 소스를 공유한다. 헤더, 공용 화면·폼·표·메뉴, 로그인, 앱 아이콘과 공유 메타데이터를 네이비·블루·보라 색상으로 적용했다.

NEXUS는 data-service 경계와 빌드 시 SERVICE_BRAND로 선택된다. K-LOL은 기존 홈 이미지, 아이콘 atlas와 메타데이터/설치 아이콘을 유지한다. 개발 환경에서는 자체 서비스워커 등록을 해제해 고정 dev chunk URL의 캐시가 스타일 업데이트를 가리지 않도록 했다. 운영 PWA 등록/캐시 로직은 동일하다.

## 자동 검증

- npm run check: PASS. lint 0 errors, 기존 warnings 87; typecheck/ERD/guide-art/build PASS.
- 계약 741 PASS; 단위 1,201 PASS, 기존 1 SKIP.
- service-brand-runtime은 실제 NEXUS/K-LOL subprocess에서 아이콘 렌더링, PWA 아이콘, OG 이미지와 키 분리를 검증한다.
- 마지막 공통 CSS 보정 후 production build PASS. 이후 인쇄 제목 글자색 1줄 수정은 lightningcss 컴파일로 재확인. Vercel 빌드에서도 최종 소스 검증.
- 현재 파일 secret-scan --tree-only, git diff --check PASS.
- 독립 리뷰: P1/P2 없음. 인쇄 제목 투명 글자 P3 수정 완료.

## 브라우저 검증

127.0.0.1:3107의 빈 로컬 NEXUS DB로 CUA 브라우저 검수했다. 운영 데이터 수정·로그인·외부 메시지 전송은 없다.

- 홈: 1440×900, 390×844, 320×812에서 문서 가로 넘침 없음. 5개 캐릭터 및 메인 이미지 모두 로드.
- 320px: 참가 버튼 46px 높이/한 줄, 검색 입력 16px 유지.
- 마스코트 리스트 키보드 ArrowRight: 포커스 표시, 실제 scrollLeft 0→40 확인.
- 전적 검색: 넥시 입력 후 /players?q=넥시 결과 화면으로 정상 이동.
- 전체 메뉴 열기/닫기, 로그인·관리자 로그인·랭킹·파티 모집 화면 시각 확인.
- 모바일 전체 메뉴 닫기 버튼, 공개 기록 패널의 대비 문제를 발견해 수정.
- 기본 버튼 white/primary 대비 5.43:1, 보조 글자/표면 7.55:1. 자동 axe 전체 스캔 또는 실기기 검증은 수행하지 않음.
- 최적화 이미지: 256px WebP 15,258 bytes / 1920px WebP 175,088 bytes. 원본 PNG 직접 로딩 없음.

## 증거

local-desktop.png, local-mobile-390.png, local-mobile-320.png, local-recruits.png.

## 복구

직전 NEXUS 운영 배포 `dpl_4GjqAJgoZPD6oezmXDELPkpUe3zn` (source `1ad03788f170a2d0b02dc48d62f1f4a39a03e803`, tag `nexus-service-v1.0.2`)로 Vercel production alias를 되돌릴 수 있다. DB migration이 없어 데이터 복구는 필요하지 않다. 기존 K-LOL 프로젝트는 배포하지 않는다.
