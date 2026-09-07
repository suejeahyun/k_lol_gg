import Link from "next/link";

export default function NotFound() { return <main className="admin-state-card"><h1>챔피언을 찾을 수 없습니다.</h1><p>주소를 확인하거나 목록에서 다시 선택해 주세요.</p><Link href="/admin/champions">챔피언 목록</Link></main>; }
