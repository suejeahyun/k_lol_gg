import { SERVICE_BRAND } from "@/lib/service-brand";
import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { SignupForm } from "@/components/accounts/account-auth-forms";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";
import styles from "@/components/accounts/account-access.module.css";

export const metadata = createRouteMetadata("/signup");

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const PageContainer = SERVICE_BRAND.id === "hub" || SERVICE_BRAND.id === "community" ? "main" : "div";
  const nextPath = normalizeAccountNext((await searchParams).next, "/");
  const featureState = await readSiteFeatureState("registrations");
  if (featureState !== "enabled") {
    return <PageContainer className={styles.page}><SiteFeatureStatePanel label={siteFeatureLabel("registrations")} state={featureState} /></PageContainer>;
  }
  return (
    <PageContainer className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.formCard} aria-labelledby="signup-title">
        <h1 id="signup-title">회원가입</h1><SignupForm nextPath={nextPath} />
      </section>
    </div></PageContainer>
  );
}
