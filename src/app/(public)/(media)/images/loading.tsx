import { Sparkles } from "lucide-react";
import styles from "../media.module.css";
export default function Loading() { return <div className={`page-wrap ${styles.page}`}><section className={styles.state} role="status"><Sparkles /><h2>갤러리를 불러오는 중이에요.</h2><p>이미지를 차례대로 정리하고 있습니다.</p></section></div>; }
