import { permanentRedirect } from "next/navigation";
export default function LegacyKakaoStatsPage() { permanentRedirect("/admin/kakao?tab=stats"); }
