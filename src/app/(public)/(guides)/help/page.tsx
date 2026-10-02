import { ArrowRight } from "@/components/theme/theme-icons";
import Link from "next/link";
import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

export const metadata = createRouteMetadata("/help");

const guides = [
  ["/applications", "오늘 내전에 참가하고 싶어요", "회차와 종목을 고르고 내 참가 신청을 확인해요."],
  ["/help/recruits", "파티 모집에 참여하고 싶어요", "카카오톡 최신 명단 받기, 참여와 취소 방법을 확인해요."],
  ["/tools/team-balance", "팀을 공평하게 나누고 싶어요", "참가자 10명을 골라 실력과 포지션에 맞는 팀을 만들어요."],
  ["/matches/submit", "경기 결과를 올리고 싶어요", "결과를 접수한 뒤 내 제출 내역에서 검토 상태를 확인해요."],
  ["/account", "계정 승인·연결이 궁금해요", "현재 상태와 연결된 플레이어, 이용 제한 안내를 확인해요."],
  ["/forgot-password", "로그인이 안 돼요", "비밀번호를 잊었다면 복구를 요청해요."],
  ["/help/riot", "Riot 계정을 연결하고 싶어요", "연동 범위와 전적 동기화 방법을 알아봐요."],
  ["/help/kakao", "카카오 봇 명령을 찾고 있어요", "모집 현황, 명단, 기록을 확인하는 명령을 찾아요."],
  ["/install", "휴대폰 홈 화면에 추가하고 싶어요", "앱처럼 빠르게 열 수 있도록 설치 방법을 확인해요."],
] as const;

export default function HelpPage() {
  return <div className="page-wrap help-page"><header><h1>어떤 도움이 필요하세요?</h1><p>하려는 일을 고르면 필요한 화면과 안내로 연결합니다.</p></header><div className="task-links">{guides.map(([href, title, description]) => <Link className="task-link" key={href} href={href}><strong>{title}</strong><span>{description}</span></Link>)}</div><section className="task-section"><h2>여전히 해결되지 않았나요?</h2><p>K-LOL.GG 운영팀에 오류, 계정 문제, 개선 제안 또는 개인정보 요청을 남겨 주세요.</p><Link href="/help/contact">운영팀에 문의하기 <ArrowRight className="theme-inline-icon" aria-hidden="true" /></Link></section></div>;
}
