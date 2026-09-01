import styles from "@/components/admin/players/admin-players.module.css";

export default function AdminPlayersLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="플레이어 등록부 불러오는 중">
      <div className={styles.loadingGrid} aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </main>
  );
}
