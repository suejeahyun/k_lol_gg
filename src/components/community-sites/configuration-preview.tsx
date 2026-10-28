/* eslint-disable @next/next/no-img-element -- Preview images use validated public URLs directly; the server does not proxy them. */
"use client";

import type { CSSProperties } from "react";
import { communityAccentForeground, COMMUNITY_TEMPLATES, getVisibleCommunityHomeSections, parseCommunityImageUrl, type CommunitySiteConfig } from "@/modules/community-sites/domain/site-configuration";
import styles from "./site-configuration.module.css";

function safePreviewImage(value: string | null): string | null {
  try { return parseCommunityImageUrl(value); } catch { return null; }
}

export function ConfigurationPreview({ configuration, compact = false }: {
  configuration: CommunitySiteConfig;
  compact?: boolean;
}) {
  const template = COMMUNITY_TEMPLATES.find((item) => item.id === configuration.templateId) ?? COMMUNITY_TEMPLATES[0];
  const accent = /^#[\da-f]{6}$/i.test(configuration.primaryColor) ? configuration.primaryColor : template.defaultColor;
  const logoUrl = safePreviewImage(configuration.logoUrl);
  const bannerUrl = safePreviewImage(configuration.bannerUrl);
  const sections = getVisibleCommunityHomeSections(configuration);
  return (
    <section className={`${styles.preview} ${compact ? styles.compact : ""}`} data-template={template.id}
      aria-label={`${template.name} 테마 미리보기`}
      style={{ "--community-accent": accent, "--community-accent-text": communityAccentForeground(accent) } as CSSProperties}>
      <div className={styles.previewBar}><span className={styles.browserDots} aria-hidden="true">● ● ●</span><span>{configuration.slug || "사이트 주소"}</span><span>미리보기</span></div>
      <div className={styles.previewNavigation}>
        <strong className={styles.previewBrand}>
          <span className={styles.previewLogo}>{configuration.name.trim().slice(0, 1) || "G"}
            {logoUrl && <img key={logoUrl} src={logoUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
          </span>
          {configuration.name.trim() || "커뮤니티 이름"}
        </strong>
        <div className={styles.previewLinks} aria-label="표시될 메뉴">
          {configuration.modules.recruiting && <span>모집</span>}
          {configuration.modules.competitions && <span>대회</span>}
          {configuration.modules.media && <span>갤러리</span>}
          <span>멤버</span>
        </div>
      </div>
      <div className={styles.previewHero}>
        {bannerUrl && <img key={bannerUrl} className={styles.previewBanner} src={bannerUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>OUR COMMUNITY · {template.name.toUpperCase()}</span>
          <h3>{configuration.name.trim() || "우리의 새로운 시작"}</h3>
          <p>{configuration.description.trim() || "함께하고 싶은 우리 커뮤니티의 이야기를 소개해 주세요."}</p>
          <span className={styles.previewCta}>커뮤니티 둘러보기 <span aria-hidden="true">↗</span></span>
        </div>
        <span className={styles.heroEmblem} aria-hidden="true">{template.id === "arena" ? "✦" : template.id === "lounge" ? "✳" : "✧"}</span>
      </div>
      <div className={styles.previewSections}>
        {sections.map((section, index) => <article key={section.id} className={styles.previewSection} data-section={section.id}>
          <div className={styles.sectionHeading}><span>{String(index + 1).padStart(2, "0")}</span><h4>{section.label}</h4></div>
          <p>{section.id === "introduction" ? configuration.description || section.emptyText : section.emptyText}</p>
          {section.id === "media" && <div className={styles.mediaPlaceholders} aria-hidden="true"><span>+</span><span>+</span><span>+</span></div>}
        </article>)}
      </div>
      <p className={styles.previewFootnote}>구성 미리보기입니다. 회원·경기·모집 데이터는 빈 상태로 시작합니다.</p>
    </section>
  );
}
