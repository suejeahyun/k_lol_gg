import { createDefaultCommunityIntroduction, validateCommunityIntroduction, type CommunityIntroduction } from "@/modules/operations/domain/community-introduction";
import styles from "./introduction.module.css";

type PublicProfile = Omit<CommunityIntroduction, "published">;
function previewUrl(profile: PublicProfile, field: "bannerUrl" | "contactUrl") {
  // Editor drafts use the same URL policy as published content before the browser loads a resource.
  try { return validateCommunityIntroduction({ ...createDefaultCommunityIntroduction(), [field]: profile[field] })[field]; }
  catch { return null; }
}

export function IntroductionContent({ profile, headingLevel = 2 }: { profile: PublicProfile; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const bannerUrl = previewUrl(profile, "bannerUrl");
  const contactUrl = previewUrl(profile, "contactUrl");
  const sections = [
    ["커뮤니티 소개", profile.introduction], ["함께하는 활동", profile.activities],
    ["주로 활동하는 시간", profile.activityHours], ["가입·참여 안내", profile.joiningInfo],
  ] as const;
  return <div className={styles.content}>
    {bannerUrl ? /* eslint-disable-next-line @next/next/no-img-element -- Public validated URL; never proxy arbitrary site images through the server. */
      <img className={styles.banner} src={bannerUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : null}
    {profile.summary ? <p className={styles.summary}>{profile.summary}</p> : null}
    {sections.filter(([, value]) => value.trim()).map(([label, value]) => <section className={styles.section} key={label}>
      <Heading>{label}</Heading><p>{value}</p>
    </section>)}
    {contactUrl ? <section className={styles.section}><Heading>운영진 문의</Heading>
      <a className={styles.contact} href={contactUrl} target="_blank" rel="noopener noreferrer">문의 페이지 열기 <span aria-hidden="true">↗</span><span className="sr-only"> (새 창)</span></a>
    </section> : null}
  </div>;
}
