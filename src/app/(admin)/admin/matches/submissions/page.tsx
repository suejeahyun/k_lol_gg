export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { getKstDateKey } from "@/lib/date/kst";

export default async function InhouseResultSubmissionsPage() {
  const submissions = await prisma.inhouseResultSubmission.findMany({ include: { images: { include: { privateAsset: true }, orderBy: { gameNumber: "asc" } }, matchSeries: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return <main className="admin-page"><div className="admin-page__header"><div><p className="page-eyebrow">INHOUSE RESULT</p><h1>카카오 내전 결과 접수</h1></div><Link className="admin-button admin-button--ghost" href="/admin/matches">내전 목록</Link></div>
    <section className="admin-card"><p>사진은 비공개 저장소에 보관되며 관리자만 열람할 수 있습니다. 사진을 확인한 뒤 기존 등록 폼에서 수기로 확정합니다.</p><div style={{overflowX:"auto"}}><table><thead><tr><th>접수</th><th>진행 정보</th><th>결과 사진</th><th>상태/연결</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}><td>{item.publicCode}<br/><small>{item.organizer}</small></td><td>{getKstDateKey(item.matchDate)} · {item.seriesNumber}회차<br/>{item.expectedGameCount}세트</td><td>{item.images.map((image) => <a key={image.id} className="admin-button admin-button--ghost" target="_blank" href={`/api/admin/private-assets/${image.privateAssetId}`}>{image.gameNumber}세트</a>)}</td><td>{item.matchSeries ? <Link href={`/admin/matches/${item.matchSeries.id}/edit`}>{item.matchSeries.title}</Link> : <Link className="admin-button" href={`/admin/matches/new?submissionId=${item.id}`}>수기 등록 시작</Link>}<br/><small>{item.status}</small></td></tr>)}</tbody></table></div></section>
  </main>;
}
