import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  redirect(`/admin/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
}
