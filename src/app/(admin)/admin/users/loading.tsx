import styles from "@/components/admin/players/admin-players.module.css";
export default function AdminUsersLoading() { return <main className={styles.page} role="status" aria-label="계정 목록을 불러오는 중"><div className={styles.loadingGrid}><span /><span /><span /></div></main>; }
