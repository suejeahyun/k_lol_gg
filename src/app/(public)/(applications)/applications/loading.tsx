import styles from "./applications.module.css";

export default function ApplicationsLoading() {
  return (
    <main className={`page-wrap ${styles.page}`} aria-busy="true" aria-label="참가 신청 불러오는 중">
      <div className={styles.loadingHero} />
      <div className={styles.loadingGrid}><span /><span /><span /></div>
    </main>
  );
}
