"use client";
import styles from "@/components/admin/players/admin-players.module.css";
export default function AdminUsersError({ retry }: { retry: () => void }) { return <main className={styles.page}><section className={styles.state} data-tone="error" role="alert"><h2>계정 화면을 불러오지 못했습니다.</h2><button className={styles.primaryLink} type="button" onClick={retry}>다시 시도</button></section></main>; }
