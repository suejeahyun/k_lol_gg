import Link from "next/link";

export default function NotFound() { return <main className="admin-state-card"><h1>챔피언을 찾을 수 없습니다.</h1><Link href="/admin/champions">챔피언 목록</Link></main>; }
