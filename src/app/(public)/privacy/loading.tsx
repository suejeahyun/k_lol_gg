import styles from "@/components/accounts/account-access.module.css";

export default function PrivacyLoading() {
  return <div className={styles.page}><section className={styles.panel} role="status" aria-live="polite"><h1>개인정보 처리 안내를 불러오는 중…</h1></section></div>;
}

