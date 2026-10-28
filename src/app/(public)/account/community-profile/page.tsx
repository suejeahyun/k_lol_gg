import { notFound, redirect } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { requireAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { CommunityProfileForm } from "@/components/accounts/community-profile-form";
import styles from "@/components/accounts/account-access.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "커뮤니티 게임 프로필 등록", robots: { index: false, follow: false } };
export default async function CommunityProfilePage() {
  if (SERVICE_BRAND.id !== "community") notFound();
  const session = await requireAccountPage("/account/community-profile");
  const account = await getRuntimeAccountRepository()?.findSelf(session.userId);
  if (account?.player || account?.playerClaim) redirect("/account");
  return <div className={styles.page}><section className={styles.formCard}><h1>게임 프로필 등록</h1><CommunityProfileForm /></section></div>;
}
