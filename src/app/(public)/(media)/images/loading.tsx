import { Sparkles } from "@/components/theme/theme-icons";
import styles from "../media.module.css";
export default function Loading() { return <div className={`page-wrap ${styles.page}`}><section className={styles.state} role="status"><Sparkles /><h2>갤러리를 불러오는 중이에요.</h2></section></div>; }
