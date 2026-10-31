"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "@/components/theme/theme-icons";
import { ConfigurationPreview } from "@/components/community-sites/configuration-preview";
import { COMMUNITY_TEMPLATES, createDefaultCommunitySiteConfig, type CommunityTemplateId } from "@/modules/community-sites/domain/site-configuration";
import styles from "./template-showcase.module.css";

export function TemplateShowcase() {
  const [selected, setSelected] = useState<CommunityTemplateId>("arena");
  const template = COMMUNITY_TEMPLATES.find((item) => item.id === selected)!;
  const configuration = { ...createDefaultCommunitySiteConfig(selected), name: "우리의 플레이그라운드", slug: "our-community", description: "좋아하는 게임, 함께하는 사람들. 우리만의 이야기가 시작되는 곳." };
  return <section className={styles.showcase} aria-label="커뮤니티 테마 체험">
    <h2 className={styles.srOnly}>우리 커뮤니티의 테마 미리보기</h2>
    <div className={styles.caption}><span>MAKE IT YOURS</span><span>세 가지 시작, 우리만의 공간</span></div>
    <div className={styles.preview}><ConfigurationPreview configuration={configuration} compact /></div>
    <fieldset className={styles.themes}>
      <legend>우리 커뮤니티에 어울리는 테마</legend>
      {COMMUNITY_TEMPLATES.map((item) => <label key={item.id} data-theme={item.id} className={styles.choice}>
        <input type="radio" name="home-community-theme" value={item.id} checked={item.id === selected} onChange={() => setSelected(item.id)} />
        <span className={styles.swatch} aria-hidden="true" /><strong>{item.name}</strong><Check size={14} aria-hidden="true" />
      </label>)}
    </fieldset>
    <div className={styles.selection}><p role="status"><strong>{template.subtitle}</strong><span>{template.description}</span></p>
      <Link href={`/sites/new?theme=${template.id}`}>{template.name}로 시작 <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </section>;
}
