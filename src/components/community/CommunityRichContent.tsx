import { sanitizeCommunityHtml } from "@/lib/community/html";

type CommunityRichContentProps = {
  html: string;
};

export default function CommunityRichContent({ html }: CommunityRichContentProps) {
  return (
    <div
      className="community-rich-content"
      dangerouslySetInnerHTML={{ __html: sanitizeCommunityHtml(html) }}
    />
  );
}
