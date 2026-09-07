import Link from "next/link";
import { Images } from "lucide-react";
import styles from "../../media.module.css";
export default function NotFound() { return <div className={`page-wrap ${styles.page}`}><section className={styles.state}><Images /><h2>공개된 갤러리를 찾을 수 없어요.</h2><p>주소가 바뀌었거나 게시가 종료되었을 수 있습니다.</p><Link className={styles.back} href="/images">갤러리 목록</Link></section></div>; }
