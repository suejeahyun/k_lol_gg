import Link from "next/link";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppSection } from "@/components/app-mobile/AppCards";
import { AppInstallActions } from "@/components/app-mobile/AppInstallActions";

export const metadata = {
  title: "K-LOL.GG APP 설치 안내",
  description: "Android와 iPhone에서 K-LOL.GG APP을 홈 화면에 추가하는 방법입니다.",
};

export default function AppInstallPage() {
  return (
    <AppMobileShell title="K-LOL.GG" subtitle="APP 설치 안내">
      <section className="klol-app-hero klol-app-install-hero">
        <div className="klol-app-kicker">K-LOL.GG APP</div>
        <h1 className="klol-app-title">홈 화면에 추가</h1>
        <p className="klol-app-install-lead">
          카카오톡에서 링크를 열었다면 우측 상단 메뉴로 Chrome 또는 Safari에서 다시 열어 설치하세요.
        </p>
        <div className="klol-app-install-cta-row">
          <Link className="klol-app-primary" href="/app">
            앱 열기
          </Link>
          <Link className="klol-app-secondary" href="/login">
            로그인
          </Link>
        </div>
      </section>

      <AppSection title="Android 설치">
        <ol className="klol-app-install-steps">
          <li>
            <strong>Chrome으로 열기</strong>
            <span>카카오톡 내부 브라우저라면 우측 상단 메뉴에서 Chrome으로 열기를 선택합니다.</span>
          </li>
          <li>
            <strong>앱 설치 또는 홈 화면에 추가</strong>
            <span>Chrome 메뉴에서 앱 설치, 홈 화면에 추가, 또는 설치 배너를 선택합니다.</span>
          </li>
          <li>
            <strong>K-LOL.GG 실행</strong>
            <span>홈 화면에 생성된 K-LOL.GG 아이콘으로 접속합니다.</span>
          </li>
        </ol>
      </AppSection>

      <AppSection title="iPhone 설치">
        <ol className="klol-app-install-steps">
          <li>
            <strong>Safari로 열기</strong>
            <span>카카오톡 내부 브라우저에서는 홈 화면 추가가 제한될 수 있습니다.</span>
          </li>
          <li>
            <strong>공유 버튼 선택</strong>
            <span>Safari 하단 또는 상단의 공유 버튼을 누릅니다.</span>
          </li>
          <li>
            <strong>홈 화면에 추가</strong>
            <span>목록에서 홈 화면에 추가를 선택한 뒤 추가를 누릅니다.</span>
          </li>
        </ol>
      </AppSection>

      <AppSection title="주의사항">
        <div className="klol-app-warning-list">
          <p>카카오톡 내부 브라우저에서는 설치 버튼, 로그인 유지, 알림 동작이 제한될 수 있습니다.</p>
          <p>Android는 Chrome, iPhone은 Safari에서 설치하는 것이 가장 안정적입니다.</p>
          <p>이미 설치했다면 기존 아이콘을 삭제한 뒤 다시 추가하면 최신 아이콘과 설정이 반영됩니다.</p>
          <p>앱 설치는 자동 다운로드가 아니라 홈 화면 바로가기 방식입니다.</p>
        </div>
      </AppSection>

      <AppSection title="링크 공유">
        <AppInstallActions />
      </AppSection>
    </AppMobileShell>
  );
}
