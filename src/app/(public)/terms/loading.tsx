import styles from "@/components/accounts/account-access.module.css";

export default function TermsLoading() {
  return <div className={styles.page}><section className={styles.panel} role="status" aria-live="polite"><h1>이용약관을 불러오는 중…</h1></section></div>;
}

