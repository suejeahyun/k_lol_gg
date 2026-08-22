import Image from "next/image";

type CommunityLinksProps = {
  className: string;
};

export default function CommunityLinks({ className }: CommunityLinksProps) {
  return (
    <nav className={className} aria-label="K-LOL.GG 커뮤니티 바로가기">
      <a
        className="home-community-link home-community-link--discord"
        href="https://discord.com/invite/k-lol"
        target="_blank"
        rel="noreferrer"
      >
        <span className="home-community-link__image">
          <Image src="/discord.webp" alt="" width={64} height={64} />
        </span>
        <span className="home-community-link__copy">
          <small>공식 커뮤니티</small>
          <strong>디스코드</strong>
        </span>
        <span className="home-community-link__arrow" aria-hidden="true">↗</span>
      </a>
      <a
        className="home-community-link home-community-link--kakao"
        href="https://open.kakao.com/o/gGQ80Ucf"
        target="_blank"
        rel="noreferrer"
      >
        <span className="home-community-link__image">
          <Image src="/kakao.webp" alt="" width={64} height={64} />
        </span>
        <span className="home-community-link__copy">
          <small>오픈채팅 참여</small>
          <strong>카카오톡</strong>
        </span>
        <span className="home-community-link__arrow" aria-hidden="true">↗</span>
      </a>
    </nav>
  );
}
