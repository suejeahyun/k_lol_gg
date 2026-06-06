import Link from "next/link";
import { communityTypeLabels, communityTypePaths } from "@/lib/community/meta";

const cards = [
  { type: "HIGHLIGHT" as const, desc: "영상 링크로 내전 명장면과 웃긴 장면을 공유합니다." },
  { type: "SUGGESTION" as const, desc: "사이트 오류, 개선 요청, 운영 건의를 남깁니다." },
  { type: "MATCH_REVIEW" as const, desc: "내전별 경기 후기와 밴픽 평가를 기록합니다." },
  { type: "FREE" as const, desc: "승인 유저끼리 자유롭게 글을 작성합니다." },
  { type: "NOTICE_COMMENT" as const, desc: "공지에 대한 확인, 질문, 의견을 남깁니다." },
];

export default function CommunityHomePage() {
  return (
    <main className="page-container community-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">K-LOL COMMUNITY</p>
          <h1 className="page-title">커뮤니티</h1>
          <p className="page-description">하이라이트, 매치 리뷰, 건의사항, 자유글, 공지 댓글을 한 곳에서 관리합니다.</p>
        </div>
        <Link className="button button--primary" href="/community/clips">클립 랭킹</Link>
      </div>

      <section className="community-grid">
        {cards.map((card) => (
          <Link key={card.type} href={communityTypePaths[card.type]} className="community-card">
            <span className="community-card__code">{card.type}</span>
            <h2>{communityTypeLabels[card.type]}</h2>
            <p>{card.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
