import type { Metadata } from "next";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "운영 징계 통계", alternates: { canonical: "/discipline" } };

export default async function PublicDisciplinePage() {
  const [activeByType, totalByType] = await Promise.all([
    prisma.userDisciplineRecord.groupBy({
      by: ["type"], where: { isActive: true }, _count: { _all: true },
    }),
    prisma.userDisciplineRecord.groupBy({
      by: ["type"], _count: { _all: true },
    }),
  ]);
  const types = ["CAUTION", "WARNING", "BAN"];
  const labels: Record<string, string> = { CAUTION: "주의", WARNING: "경고", BAN: "이용 제한" };
  const activeCount = new Map(activeByType.map((item) => [item.type, item._count._all]));
  const totalCount = new Map(totalByType.map((item) => [item.type, item._count._all]));

  return <main className="public-discipline"><style>{styles}</style><p className="page-eyebrow">COMMUNITY POLICY</p><h1>운영 징계 통계</h1><p className="intro">운영 처리 현황을 투명하게 안내합니다. 개인을 식별할 수 있는 대상 정보, 개별 사유, 관리자 메모는 공개하지 않습니다.</p><section className="stats">{types.map((type) => <article className={`stat ${type.toLowerCase()}`} key={type}><span>현재 활성 {labels[type]}</span><strong>{activeCount.get(type) ?? 0}건</strong><small>누적 처리 {totalCount.get(type) ?? 0}건</small></article>)}</section><section className="card"><h2>운영 원칙</h2><ul><li>조치 대상자에게는 조치 내용과 이의제기 방법을 개별 안내합니다.</li><li>개인 추정, 신상 언급, 2차 비방을 방지하기 위해 개별 대상과 사건 내용은 공개하지 않습니다.</li><li>운영 문의 또는 이의제기는 운영진에게 개별로 전달해 주세요.</li></ul></section></main>;
}

const styles = `.public-discipline{width:min(1120px,calc(100vw - 40px));margin:0 auto;padding:36px 0 64px}.public-discipline h1{margin:5px 0 10px}.intro{color:rgba(210,230,255,.75);line-height:1.6;margin:0 0 22px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px}.stat,.card{border:1px solid rgba(82,164,255,.24);border-radius:18px;background:rgba(6,19,42,.78)}.stat{padding:20px;display:grid;gap:8px}.stat span,.stat small{color:rgba(210,230,255,.72)}.stat strong{font-size:30px}.warning{border-color:rgba(255,120,120,.4)}.ban{border-color:rgba(248,113,113,.5)}.card{padding:22px}.card h2{margin:0 0 12px}.card ul{margin:0;padding-left:20px;color:rgba(220,235,255,.85);line-height:1.7}@media(max-width:640px){.public-discipline{width:min(100% - 20px,1120px);padding-top:22px}.stats{grid-template-columns:1fr}}`;
