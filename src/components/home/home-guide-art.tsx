export function HomeGuideArt({
  webpSrc,
  alt,
}: Readonly<{
  webpSrc: string | null;
  alt: string;
}>) {
  if (!webpSrc) {
    return (
      <span
        className="hero-art__custom hero-art__custom--fallback"
        role="img"
        aria-label={`${alt}를 불러오지 못했습니다.`}
      />
    );
  }

  return (
    <picture className="hero-art__custom">
      <img
        src={webpSrc}
        alt={alt}
        width={1672}
        height={940}
        loading="eager"
        decoding="async"
      />
    </picture>
  );
}
