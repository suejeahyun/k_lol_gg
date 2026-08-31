# K-LOL.GG Bright Bloom 전면 디자인 개편 명세

- 작성일: 2026-08-31 KST
- 범위 ID: `BRIGHT-BLOOM-2026-08-31`
- 상태: 디자인 방향 확정 / 대표 자산 1종 생성 / 소스 적용 전
- 우선순위: P1 기능·보안 기반 보존 → 밝은 공통 셸 → 핵심 사용자 화면 → 관리자 화면 → 성능·접근성 검증

## 1. 사용자 요구를 실행 기준으로 변환

현재의 검정·남색 중심 e스포츠 대시보드 인상을 제거하고, 밝고 귀엽고 산뜻하며 가벼운 바람이 느껴지는 커뮤니티 서비스로 개편한다. 귀여움은 장식의 양이 아니라 둥근 형태, 맑은 색, 여유 있는 간격, 친절한 한국어 상태 설명, 부드러운 일러스트에서 만든다. 사용자의 과업과 데이터는 언제나 장식보다 먼저 읽혀야 한다.

핵심 감성 키워드는 `하늘`, `구름`, `살랑이는 리본`, `작은 꽃잎`, `다섯 명의 팀`, `친근한 경쟁`이다. 피해야 할 키워드는 `검정 e스포츠`, `네온 사이버펑크`, `과도한 금속`, `붉은 경고 남용`, `어두운 배경 위 작은 회색 글자`다.

## 2. 브랜드·IP 안전선

- 실제 챔피언·아이템 정보에는 Riot Developer 정책이 허용한 Data Dragon 자산만 사용한다.
- 생성형 이미지에는 Riot, League of Legends, 챔피언명, 로고, 스킬, 무기, 의상, 실루엣을 참조하거나 복제하지 않는다.
- 생성형 대표 이미지는 완전 오리지널 판타지 팀으로만 구성한다.
- 사이트의 비공식 프로젝트 고지를 눈에 띄는 위치에 유지하고 Riot의 보증·후원으로 오인되는 문구를 사용하지 않는다.
- 실제 챔피언 이미지는 파스텔 프레임·배경·정보 구조만 새롭게 디자인하며 원본 이미지를 재가공해 새로운 공식 스킨처럼 보이게 하지 않는다.

## 3. 시각 시스템

### 3.1 색상

| 역할 | 제안값 | 사용처 |
|---|---:|---|
| Canvas | `#F7FBFF` | 전체 페이지 배경 |
| Surface | `#FFFFFF` | 카드·패널 |
| Sky soft | `#DDF3FF` | 히어로·선택 상태 배경 |
| Lavender soft | `#EEE8FF` | 보조 섹션 |
| Mint soft | `#DDF8EE` | 성공·참여 가능 |
| Peach soft | `#FFE8DE` | 친근한 강조 |
| Primary | `#4169D8` | 주요 CTA·현재 위치 |
| Primary hover | `#3156BD` | CTA hover |
| Ink | `#24304A` | 본문·제목 |
| Muted ink | `#5A6982` | 설명·보조 정보 |
| Border | `#D9E7F4` | 카드·구분선 |
| Success | `#16805F` | 성공 텍스트·상태 |
| Warning | `#9A6512` | 주의·대기 |
| Danger | `#B83A58` | 오류·위험 행동 |
| Focus | `#1746B0` | 키보드 포커스 |

일반 텍스트 대비는 4.5:1 이상, 큰 텍스트와 UI 경계는 3:1 이상을 자동 검사한다. 연한 파스텔은 배경에만 사용하고 그 위의 텍스트는 반드시 진한 잉크색을 쓴다.

### 3.2 형태와 깊이

- 카드 반경: 기본 18px, 핵심 히어로 28px, 작은 칩 999px.
- 경계: 1px의 푸른 회색 선. 경계 없는 흰 카드 남용을 피한다.
- 그림자: `0 12px 36px rgba(76, 104, 150, 0.12)` 이하의 부드러운 한 단계만 사용한다.
- 장식: 실제 조작 영역을 가리지 않는 CSS 그라디언트·점·리본만 허용한다. 캐릭터·사물 그림은 생성 이미지 또는 승인 자산을 사용한다.
- 금색은 1위·우승에만, 빨강은 오류·패배·위험 행동에만 사용한다.

### 3.3 활자와 밀도

- 한국어 본문은 시스템 산세리프/Pretendard 계열을 유지하고 새로운 외부 폰트를 추가하지 않는다.
- 기본 본문 15~16px, 보조 설명 13px 이상, 모바일 주요 버튼 15px 이상.
- 제목은 무조건 굵게만 하지 않고 행간과 여백으로 계층을 만든다.
- 카드 정보 순서: `무엇인지 → 현재 상태 → 핵심 수치 → 다음 행동`.
- 영문 raw status는 사용자 화면에서 자연스러운 한국어 상태 라벨로 변환한다.

### 3.4 모션

- 장식 리본·꽃잎은 10~16초의 느린 이동만 허용하고 콘텐츠 이동에는 사용하지 않는다.
- hover 이동은 최대 2px, 지속시간 180ms 이하.
- `prefers-reduced-motion: reduce`에서 자동 모션과 부드러운 스크롤을 모두 중단한다.
- 모션 없이도 상태와 계층이 완전히 이해돼야 한다.

## 4. 공통 셸 개편

1. 기본 테마를 Bright Bloom으로 바꾸고 첫 페인트부터 밝은 배경이 나오게 한다.
2. PC 사이드바는 어두운 고정 패널 대신 흰색·하늘색의 가벼운 탐색 패널로 바꾼다.
3. 모바일 하단 탐색은 둥근 흰 패널과 명확한 아이콘·라벨을 사용하고 현재 탭을 색과 형태로 함께 표시한다.
4. 상단 검색·로그인·전체 메뉴는 동일한 44px 컨트롤 규격으로 통일한다.
5. loading, empty, disabled, error, success를 공통 상태 패널로 통일하고 복구 행동을 바로 제공한다.
6. 관리자 화면도 같은 밝은 토큰을 사용하되, 데이터 밀도와 위험 행동 구분은 유지한다.

## 5. 화면별 개편

### 홈

- 대표 일러스트와 함께 `지금 같이 플레이할 사람 찾기`를 Primary CTA로 제공한다.
- `플레이어 찾기`, `내 경기 확인`을 Secondary CTA로 제공한다.
- 첫 화면에서 모집 중 건수, 내 미완료 과업, 다음 이벤트를 확인할 수 있게 한다.
- 장식 이미지가 핵심 문구와 버튼의 대비를 떨어뜨리면 흰색 반투명 그라디언트로 분리한다.

### 플레이어·챔피언

- Data Dragon 챔피언 아이콘은 연한 파스텔 링과 포지션 배지를 사용한다.
- Riot ID는 전체 DOM 텍스트를 보존하고 좁은 화면에서 최대 두 줄로 읽히게 한다.
- 검색·정렬·페이지 이동은 첫 화면에서 바로 접근 가능해야 한다.
- 챔피언 이미지는 공식 Data Dragon 출처임을 기술 문서와 법적 고지에서 명확히 한다.

### 구인·참여

- 모집 카드는 역할, 남은 자리, 마감 상태, 참여 행동 순으로 읽힌다.
- 모집 중은 민트, 예정은 하늘, 대기는 라일락, 마감은 중립 회색 배경을 사용한다.
- 카카오 참여 CTA 또는 명령 복사를 카드 안에서 바로 제공한다.

### 팀 밸런스

- 5 대 5를 밝은 두 개의 팀 보드로 보여 주고 색만으로 팀을 구분하지 않는다.
- 선택 인원·검증 오류·다음 단계가 항상 보이게 한다.
- 결과 화면은 평균 점수, 포지션, 조정 이유를 읽기 쉬운 순서로 제공한다.

### 관리자

- 위험 행동은 밝은 화면에서도 붉은 테두리와 명시적 동사로 구분한다.
- 표는 모바일 카드로 전환하되 필드 순서를 유지한다.
- 비공개 증빙은 만료·미존재·접근 거부 상태를 구분하고 원본 URL을 직접 노출하지 않는다.

## 6. 이미지 자산

### 확정 자산

- `public/images/theme/bloom/klol-bloom-hero-v1.webp`
  - 1600×900, WebP, 약 100KB.
  - 홈 히어로용. 왼쪽 HTML 카피 여백, 오른쪽 오리지널 5인 판타지 팀.
  - 텍스트·로고·워터마크·공식 챔피언 유사성 없음.
- `public/images/theme/bloom/klol-sallangi-mascot-v1.webp`
  - 640×640, 투명 WebP, 약 56KB.
  - 빈 상태·성공·도움말용 오리지널 바람 전령 `살랑이`.
  - 투명 알파 보존, 텍스트·로고·공식 캐릭터 유사성 없음.

### 후속 자산

- 팀 밸런스 결과용 추상 5색 역할 심볼 1종.
- 필요성이 확인된 경우에만 OG 카드 1종. 기존 OG가 새 브랜드와 불일치할 때 교체한다.

모든 public 래스터 자산은 실사용 크기에 맞춰 WebP/AVIF로 변환하고 히어로 200KB, 일반 배경 120KB 예산을 지킨다. 원본 PNG는 public에 배포하지 않는다.

## 7. 생성 프롬프트 기록

대표 이미지는 built-in `image_gen`으로 생성했다.

```text
Use case: stylized-concept
Asset type: responsive website hero artwork for a Korean community match-management site
Primary request: a completely original, bright, cute and airy fantasy team illustration showing five friends preparing for a friendly competitive match
Scene/backdrop: sunlit sky garden above soft clouds, petals, ribbon-like breezes, distant abstract light arena, clean negative space on the left
Subject: five original chibi adventurers on the right; sunny guardian, mint scout, lavender mage, peach archer, star-lantern healer
Style/medium: polished 2.5D storybook game illustration, soft hand-painted forms, subtle paper grain
Color palette: cloud white, powder sky blue, lavender, mint, soft peach, cornflower blue
Constraints: no text, logo, trademark, watermark, game UI, official champion likeness, or dark ominous background
```

마스코트도 built-in `image_gen`으로 생성했다.

```text
Use case: stylized-concept
Asset type: transparent website mascot for empty states, success messages, and small decorative moments
Primary request: one completely original cute breeze-courier mascot called Sallangi
Subject: sky-blue breeze ribbons, one white cloud puff, lavender pinwheel crown, friendly navy eyes, peach cheeks, floating hands, translucent ribbon tail with one blank envelope
Style/medium: polished 2.5D storybook game mascot with a clean silhouette readable at small sizes
Color palette: cloud white, powder sky blue, lavender, mint, peach, dark navy details
Constraints: genuine transparent background; no text, logo, trademark, weapon, animal ears, furball body, Poro-like shape, or official character likeness
```

## 8. 완료 게이트

- 기본 진입 320/360/390/768/1280/1440px에서 어두운 전체 배경이 남지 않는다.
- 모든 핵심 사용자 화면이 Bright Bloom 토큰을 사용하며 raw dark override 의존을 제거한다.
- 키보드, 200% zoom, reduced motion, 일반 텍스트 대비 4.5:1, 조작 영역 44px 검사를 통과한다.
- 대표 이미지가 LCP를 악화시키지 않고 히어로 200KB 예산 안에 유지된다.
- 공식 Data Dragon과 오리지널 생성 자산의 출처·역할이 섞이지 않는다.
- 자동·브라우저·접근성·성능 QA에 미승인 FAIL이 없다.
