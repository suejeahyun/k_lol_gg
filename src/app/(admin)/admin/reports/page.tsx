export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { formatCommunityDate } from "@/lib/community/meta";
import { AdminReportStatusSelect } from "@/components/community/AdminCommunityActions";

export default async function AdminReportsPage() {
  const reports = await prisma.communityReport.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: { select: { userId: true } }, post: { select: { id: true, title: true } }, comment: { select: { id: true, content: true } } }, take: 100 });
  return (
    <main className="admin-page community-page">
      <div className="admin-page__header"><div><p className="page-eyebrow">REPORT ADMIN</p><h1>신고 관리</h1></div></div>
      <section className="admin-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ID</th><th>대상</th><th>내용</th><th>사유</th><th>신고자</th><th>상태</th><th>일시</th></tr></thead><tbody>
        {reports.map((report) => (<tr key={report.id}><td>#{report.id}</td><td>{report.targetType === "POST" ? "게시글" : "댓글"}</td><td>{report.post ? <Link href={`/community/posts/${report.post.id}`}>{report.post.title}</Link> : report.comment?.content.slice(0, 40)}</td><td>{report.reason}</td><td>{report.reporter.userId}</td><td><AdminReportStatusSelect reportId={report.id} value={report.status} /></td><td>{formatCommunityDate(report.createdAt)}</td></tr>))}
      </tbody></table></div></section>
    </main>
  );
}
