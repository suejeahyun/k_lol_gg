import { ArrowRight } from "@/components/theme/theme-icons";
import Link from "next/link";
import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

export const metadata = createRouteMetadata("/help");

const guides = [
  ["/applications", "오늘 내전에 참가하고 싶어요"],
  ["/help/recruits", "파티 모집에 참여하고 싶어요"],
  ["/tools/team-balance", "팀을 공평하게 나누고 싶어요"],
  ["/matches/submit", "경기 결과를 올리고 싶어요"],
  ["/account", "계정 승인·연결이 궁금해요"],
  ["/forgot-password", "로그인이 안 돼요"],
  ["/help/riot", "Riot 계정을 연결하고 싶어요"],
  ["/help/kakao", "카카오 봇 명령을 찾고 있어요"],
  ["/install", "휴대폰 홈 화면에 추가하고 싶어요"],
] as const;

export default function HelpPage() {
  return <div className="page-wrap help-page"><header><h1>어떤 도움이 필요하세요?</h1></header><div className="task-links">{guides.map(([href, title]) => <Link className="task-link" key={href} href={href}><strong>{title}</strong></Link>)}</div><section className="task-section"><h2>여전히 해결되지 않았나요?</h2><Link href="/help/contact">운영팀에 문의하기 <ArrowRight className="theme-inline-icon" aria-hidden="true" /></Link></section></div>;
}
