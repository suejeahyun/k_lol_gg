# V2 브랜드 이미지

`v2-hero-ahri.png`는 V2 전용으로 생성된 1672×941 히어로 이미지다.

- 생성 방식: built-in image generation
- 원본 SHA-256: `8C2C8C61ABFF1F1971134B832E6FBF6814210DBDD8D25E7DA7DD1FE16D3A4569`
- 용도: 홈 히어로 장식
- 텍스트·로고·워터마크 없음
- UI 문구를 위한 왼쪽 여백 포함

## 최적화 파생본

- `v2-hero-ahri-1600.webp`: 1600×900, 81,952B, SHA-256 `D0C6A192BE81BBA3FF674AD7853D97E8679CF382E7533A50C27879F743402B83`
- `v2-hero-ahri-1600.avif`: 1600×900, 53,799B, SHA-256 `62CC9D13F78DD4D90FBE675A83F8643D9A5D20E55CD08C0AC63B1CB64B8B8699`
- `public/og.png`: 1200×630, 303,652B, SHA-256 `9150A1D9D888A20593341F15AA516868A7BBE1AF89B1BC798543ABC3F081F988`

홈은 Next Image가 원본 PNG에서 브라우저별 형식을 협상한다. 파생본은 이후 정적
이미지 경로나 직접 전달이 필요한 화면에서 사용할 수 있는 성능 안전 대안이다. 생성 및
검증 정보는 `public/images/champions/asset-manifest.json`과
`qa/2026-09-01-v2-visual-assets/REPORT.md`에 기록한다.

## 공개 전 정책 게이트

공개·배포 직전에 Riot Games의 최신 [Legal Jibber Jabber 정책](https://www.riotgames.com/en/legal)을 다시 확인한다. 비상업 커뮤니티 사용 조건, Riot 소유 자산의 사용 범위, 상표 제한을 점검하고 다음 의미의 팬 프로젝트 고지가 화면에서 눈에 잘 띄는지 검수해야 한다.

> K-LOL.GG는 Riot Games 소유 자산을 사용하여 Riot Games의 Legal Jibber Jabber 정책에 따라 제작된 팬 프로젝트이며, Riot Games가 승인하거나 후원하지 않는다.

정책 확인일과 검수 증거가 없으면 V2를 공개하거나 운영 도메인으로 전환하지 않는다.
