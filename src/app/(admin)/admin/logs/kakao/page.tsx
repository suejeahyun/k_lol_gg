import { permanentRedirect } from "next/navigation";
export default function LegacyKakaoLogsPage() { permanentRedirect("/admin/kakao?tab=logs"); }
