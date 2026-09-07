import Link from "next/link";
import { Images } from "lucide-react";
import styles from "@/components/admin/media/admin-media.module.css";
export default function NotFound() { return <main className={styles.page}><section className={styles.state}><Images /><h2>갤러리를 찾을 수 없습니다.</h2><p>주소를 확인하거나 목록으로 돌아가 주세요.</p><Link href="/admin/images">갤러리 목록</Link></section></main>; }
