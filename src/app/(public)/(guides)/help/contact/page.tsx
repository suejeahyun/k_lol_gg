import Link from "next/link";
import { SupportForm } from "@/components/navigation/support-form";
import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

export const metadata = createRouteMetadata("/help/contact");

export default function ContactPage() {
  return <div className="page-wrap help-page"><header><h1>운영팀에 문의하기</h1><p>K-LOL.GG 운영팀이 확인합니다. 계정이 없어도 접수할 수 있으며 문의 내용과 연락 방법은 공개되지 않습니다.</p></header><nav className="recovery-links" aria-label="문의 전 도움말"><Link href="/help">도움말 찾기</Link><Link href="/forgot-password">비밀번호 복구</Link><Link href="/privacy">개인정보 안내</Link></nav><SupportForm /></div>;
}
