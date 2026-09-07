import styles from "@/components/accounts/account-access.module.css";
export default function AccountLoading() { return <div className={styles.page} role="status" aria-label="계정 정보를 불러오는 중"><div className={styles.skeleton} /></div>; }
