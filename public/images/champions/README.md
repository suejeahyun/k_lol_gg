# V2 챔피언 장식 자산 팩

럭스·잔나·세라핀·룰루·그웬을 새 포즈와 새 배경으로 생성한 **비공식 AI
팬아트**다. Riot Games 공식 원본 이미지나 로고를 복사·다운로드해 사용하지 않았다.

## 사용 기준

- 카드 표시 크기는 최대 384 CSS px를 권장한다. 768×768 원본이 DPR 2 화면까지 대응한다.
- AVIF를 우선 제공하고 WebP를 폴백으로 둔다.
- 이미지가 콘텐츠 의미를 전달하면 `asset-manifest.json`의 한국어 `alt`를 사용한다.
- 옆 제목과 같은 내용을 반복하는 순수 장식이면 `alt=""`로 두고 스크린 리더에서 제외한다.
- 임의로 Riot Games 로고나 공식 승인처럼 보이는 문구를 합성하지 않는다.
- 공개 전 화면의 팬 프로젝트 고지와 Riot Games 최신 정책을 다시 검수한다.

```html
<picture>
  <source srcset="/images/champions/lux-card.avif" type="image/avif" />
  <img
    src="/images/champions/lux-card.webp"
    width="768"
    height="768"
    alt="햇살 가득한 구름 정원에서 빛의 지팡이를 든 럭스 비공식 AI 팬아트"
    loading="lazy"
    decoding="async"
  />
</picture>
```

픽셀 크기, 바이트, SHA-256, 성능 예산, 생성 출처는
`asset-manifest.json`을 단일 기준으로 사용한다.
